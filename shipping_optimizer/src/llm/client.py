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

        # OpenCode fallback model chain (different architectures for diversity)
        self.fallback_models = [
            "qwen3.6-plus-free",
            "minimax-m3-free",
            "mimo-v2.5-free",
            "nemotron-3-ultra-free",
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
                    timeout=30,
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
        # ----------------------------------------
        stripped = self._strip_model(model)
        candidates = [stripped] + [m for m in self.fallback_models if m != stripped]
        response = None
        last_exception = None

        for idx, candidate in enumerate(candidates):
            try:
                response = self._try_call(
                    candidate, system, user_message,
                    temperature, max_tokens,
                )
                if idx > 0:
                    self.fallback_uses += 1
                    logger.info("llm_fallback_used",
                                requested=model, used=candidate)
                self.failure_count = 0
                break
            except Exception as e:
                last_exception = e
                self.failure_count += 1
                self.last_failure_time = time.time()
                logger.warning("llm_candidate_failed",
                               candidate=candidate, error=str(e)[:200])

        if response is None:
            logger.error("llm_all_candidates_failed",
                         last_error=str(last_exception)[:200] if last_exception else "unknown",
                         total_candidates=len(candidates))
            return self._get_hard_fallback_response()

        # ----------------------------------------
        # 🔥 SAFE RESPONSE EXTRACTION (ALWAYS RUNS)
        # ----------------------------------------
        result = ""

        try:
            if response and response.choices:
                message = response.choices[0].message

                if hasattr(message, "content") and message.content:
                    result = message.content

                elif hasattr(message, "tool_calls") and message.tool_calls:
                    result = str(message.tool_calls)

                else:
                    result = str(message)

        except Exception as e:
            logger.warning("llm_parse_failed", error=str(e))

        # ----------------------------------------
        # 🔥 HARD FALLBACK (NEVER RETURN NONE)
        # ----------------------------------------
        if not result or result.lower() == "none":
            logger.warning("empty_llm_response")
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