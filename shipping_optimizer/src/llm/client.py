from openai import OpenAI
import hashlib
import time
from typing import Optional

from src.utils.logger import logger
from src.utils.config import Config


class LLMClient:

    def __init__(self):
        self.client = OpenAI(
            base_url=Config.LLM_BASE_URL,
            api_key=Config.LLM_API_KEY
        )

        # ⚡ Phase P+1F: Reordered — operational models first.
        # qwen3.6-plus-free and minimax-m3-free have expired free promos
        # (return 401 errors since 2026-06). mimo-v2.5-free is fast and
        # operational. nemotron is operational but very slow (50s+).
        self.fallback_models = [
            "mimo-v2.5-free",          # operational, fast (~1s)
            "nemotron-3-ultra-free",   # operational, slow (~50s)
            "qwen3.6-plus-free",       # expired promo (401)
            "minimax-m3-free",         # expired promo (401)
        ]

        self.cache = {}
        self.total_calls = 0
        self.cache_hits = 0
        self.fallback_uses = 0

        # Circuit breaker state
        self.failure_count = 0
        self.last_failure_time = 0
        self.circuit_breaker_threshold = 5  # failures before opening
        self.circuit_breaker_timeout = 60   # seconds to wait before retry
        self.max_retries = 2
        self.retry_delay = 1.0  # seconds

    def _try_call(self, model: str, system: str, user_message: str,
                  temperature: float, max_tokens: int):
        """Single model call with retries. Returns response or raises."""
        last_err = None
        for attempt in range(self.max_retries + 1):
            try:
                if attempt > 0:
                    logger.info("llm_retry", attempt=attempt, model=model)
                    time.sleep(self.retry_delay * attempt)
                logger.info("llm_calling", model=model, attempt=attempt, base_url=Config.LLM_BASE_URL)
                return self.client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user_message},
                    ],
                    temperature=temperature,
                    max_tokens=max_tokens,
                    # ⚡ Phase P+1F: Increased from 30s to 60s.
                    # The service gen JSON prompt intermittently takes >30s
                    # on the OpenCode free-tier API, returning empty content
                    # when the server-side generation is interrupted.
                    timeout=60,
                )
            except Exception as e:
                last_err = e
                logger.warning("llm_attempt_failed",
                               error=str(e)[:200],
                               attempt=attempt, model=model)
        raise last_err

    def _is_circuit_open(self) -> bool:
        """Check if circuit breaker is open"""
        if self.failure_count < self.circuit_breaker_threshold:
            return False

        # Check if timeout has elapsed
        if time.time() - self.last_failure_time > self.circuit_breaker_timeout:
            self.failure_count = 0  # Reset on timeout
            return False

        return True

    @staticmethod
    def _strip_model(model: str) -> str:
        """Strip provider prefix (e.g. opencode/deepseek -> deepseek)."""
        return model.split("/", 1)[-1] if "/" in model else model

    def _get_hard_fallback_response(self) -> str:
        """Generate a sensible fallback response based on context"""
        return "Service temporarily unavailable. Using default optimization parameters."

    @staticmethod
    def _extract_response_content(response) -> str:
        """Extract usable content from an LLM response.

        Returns the content string, or None if the response is reasoning-only
        (content='' with reasoning_content populated) and should trigger a
        fallback model retry.
        """
        try:
            if response and response.choices:
                message = response.choices[0].message

                # ── Content present (even if empty string) ──────────────
                if hasattr(message, "content") and message.content is not None:
                    # Return empty string or actual content — both are valid
                    return message.content or ""

                # ── Tool calls (structured output) ──────────────────────
                if hasattr(message, "tool_calls") and message.tool_calls:
                    return str(message.tool_calls)

                # ── Reasoning only (content='' but reasoning_content set) ─
                # The OpenCode free-tier models sometimes return content=''
                # with reasoning_content populated, particularly when the
                # model's generation exceeds the API's internal time limit
                # (observed: latency > 20s correlates with empty content).
                # Return None to trigger the candidate loop to try the next
                # fallback model, which may return proper content.
                if hasattr(message, "reasoning_content") and message.reasoning_content:
                    logger.warning(
                        "llm_only_reasoning",
                        reasoning=message.reasoning_content[:200],
                    )
                    return None  # Try next candidate

                # ── No usable content at all ─────────────────────────────
                return None
        except Exception as e:
            logger.warning("llm_extract_failed", error=str(e))
            return None

        return None

    def chat(
        self,
        model: str,
        system: str,
        user_message: str,
        temperature: float = 0.2,
        max_tokens: int = 2000
    ) -> str:

        self.total_calls += 1

        # ✅ Stable cache key
        cache_key = hashlib.md5(
            f"{model}|{system}|{user_message}".encode()
        ).hexdigest()

        if cache_key in self.cache:
            self.cache_hits += 1
            logger.info(
                "llm_cache_hit",
                hit_rate=f"{self.cache_hits}/{self.total_calls}"
            )
            return self.cache[cache_key]

        # Check circuit breaker
        if self._is_circuit_open():
            logger.warning("llm_circuit_breaker_open",
                          failures=self.failure_count,
                          model=model)
            return self._get_hard_fallback_response()

        # ----------------------------------------
        # Try the requested model, then walk fallback allowlist.
        # Strip provider prefix (e.g. "opencode/deepseek..." -> "deepseek...")
        # OpenCode uses plain model slugs without provider prefix.
        #
        # Phase P+1C: Response extraction is now integrated into the candidate
        # loop. When a model returns reasoning-only content (content='' with
        # reasoning_content populated), we treat it as a failure and try the
        # next candidate model. Previously, the extraction was outside the loop
        # and always accepted the first response — which silently produced
        # non-JSON serialized objects for every JSON-prompt call.
        # ----------------------------------------
        stripped = self._strip_model(model)
        candidates = [stripped] + [m for m in self.fallback_models if m != stripped]
        result = ""
        last_exception = None
        used_fallback = False

        for idx, candidate in enumerate(candidates):
            try:
                response = self._try_call(
                    candidate, system, user_message,
                    temperature, max_tokens,
                )
                content = self._extract_response_content(response)
                if content is not None:
                    # Got usable content — accept this candidate
                    result = content
                    if idx > 0:
                        used_fallback = True
                        self.fallback_uses += 1
                        logger.info("llm_fallback_used",
                                    requested=model, used=candidate)
                    self.failure_count = 0
                    break
                else:
                    # Reasoning-only response — treat as candidate failure
                    logger.warning(
                        "llm_candidate_reasoning_only",
                        candidate=candidate,
                    )
                    raise ValueError("reasoning_only_response")

            except Exception as e:
                last_exception = e
                self.failure_count += 1
                self.last_failure_time = time.time()
                logger.warning("llm_candidate_failed",
                               candidate=candidate, error=str(e)[:200])

        if not result:
            logger.error("llm_all_candidates_failed",
                         last_error=str(last_exception)[:200] if last_exception else "unknown",
                         total_candidates=len(candidates))
            result = self._get_hard_fallback_response()

        # ----------------------------------------
        # Clean output
        # ----------------------------------------
        result = result.strip()

        while "\n\n\n" in result:
            result = result.replace("\n\n\n", "\n\n")

        # ----------------------------------------
        # Logging
        # ----------------------------------------
        try:
            logger.info(
                "llm_success",
                model=model,
                prompt_tokens=getattr(response.usage, "prompt_tokens", 0),
                completion_tokens=getattr(response.usage, "completion_tokens", 0)
            )
        except:
            logger.info("llm_success_no_usage", model=model)

        # ----------------------------------------
        # Cache result
        # ----------------------------------------
        self.cache[cache_key] = result

        return result


# Singleton
llm_client = LLMClient()