import logging
import random
from typing import Dict, Any, List, Optional
from collections import defaultdict

from src.agents.base                          import BaseAgent
from src.services.hub_detector                import HubDetector
from src.services.candidate_service_generator import CandidateServiceGenerator
from src.optimization.data                    import Problem, Service
from src.utils.fuel_cost                      import map_capacity_to_vessel_class
from src.validation.archetype_validator       import validate_archetype_params, DEFAULT_ARCHETYPE_PARAMS

logger = logging.getLogger(__name__)


class ServiceGeneratorAgent(BaseAgent):

    def __init__(self, name: str, model: str):
        super().__init__(name=name, role="Shipping Service Generator", model=model)
        # ⚡ Phase P+1C: Runtime measurement counters
        self._metrics = {
            "llm_calls": 0,
            "json_parse_success": 0,
            "validator_executed": 0,
            "fallback_count": 0,
        }

    def get_system_prompt(self) -> str:
        return (
            "You are a liner shipping service design specialist.\n\n"
            "Advise on service archetypes for a given port network. "
            "Ground every recommendation in the network statistics provided. "
            "Every statement must cite a specific number. "
            "Do not use vague language. Do not repeat the question."
        )

    # ------------------------------------------------------------------
    # Core service generation
    # ------------------------------------------------------------------
    def generate_services(self, problem: Problem, archetype_params: Optional[Dict] = None) -> List[Service]:
        logger.info(
            "service_generation_started",
            ports=len(problem.ports), demands=len(problem.demands),
        )

        hub_detector = HubDetector(problem)
        hubs         = hub_detector.detect_hubs(top_k=20)   # use top-20 hubs
        hub_set      = set(hubs)
        top10_hubs   = hubs[:10]

        services: List[Service] = []
        sid = 0

        # ── Apply archetype params to influence generation mix ─────────
        params = archetype_params or {}
        arch_mix = params.get("archetype_mix", {})
        if not arch_mix:
            arch_mix = {k: v for k, v in params.items() if k.endswith("_ratio")} or {
                "direct_ratio": 0.60, "hub_loop_ratio": 0.15, "feeder_ratio": 0.20, "trunk_ratio": 0.05
            }
        vb = params.get("vessel_bias", params.get("vessel_bias", "balanced"))
        ratios_valid = all(k in arch_mix for k in ("direct_ratio", "hub_loop_ratio", "feeder_ratio", "trunk_ratio"))

        if ratios_valid:
            dr = arch_mix["direct_ratio"]
            hl = arch_mix["hub_loop_ratio"]
            fr = arch_mix["feeder_ratio"]
            BASE_DR, BASE_HL, BASE_FR = 0.60, 0.15, 0.20
            n_direct = min(800, max(200, int(500 * dr / max(BASE_DR, 0.01))))
            hub_loop_count = max(2, int(10 * hl / max(BASE_HL, 0.01)))
            feeder_count_target = max(20, int(100 * fr / max(BASE_FR, 0.01)))
            logger.info("archetype_params_applied", direct_ratio=dr, hub_loop_ratio=hl,
                       feeder_ratio=fr, trunk_ratio=arch_mix.get("trunk_ratio", 0.05))
        else:
            n_direct = 500
            hub_loop_count = 10
            feeder_count_target = 100

        # ── A: Direct services for top-N high-demand corridors ─────────
        top_demands  = sorted(problem.demands, key=lambda d: d.weekly_teu, reverse=True)
        n_direct = min(n_direct, len(top_demands))
        for d in top_demands[:n_direct]:
            if d.origin == d.destination:
                continue
            # Match vessel capacity to demand (with 20% buffer for growth)
            demand_teu = d.weekly_teu
            target_capacity = max(1000, demand_teu * 1.2)  # Min 1000 TEU, 20% buffer

            # Round to nearest standard vessel size
            standard_sizes = [1000, 2000, 4500, 8000, 12000, 16000]
            closest_size = min(standard_sizes, key=lambda x: abs(x - target_capacity))

            vessel_class = map_capacity_to_vessel_class(closest_size)
            # Scale cost proportionally
            weekly_cost = 150_000 * (closest_size / 8000)

            services.append(Service(
                id=sid, ports=[d.origin, d.destination],
                capacity=closest_size, weekly_cost=weekly_cost, cycle_time=14,
                vessel_class=vessel_class
            ))
            sid += 1
        logger.info("direct_services_added", count=n_direct)

        # ── B: Multi-port regional loop services via each hub ───────────
        # Each loop visits the hub + its top-N spoke ports.
        # This is the key driver of transshipment coverage.
        demand_by_port = defaultdict(float)
        for d in problem.demands:
            demand_by_port[d.origin]      += d.weekly_teu
            demand_by_port[d.destination] += d.weekly_teu

        loop_count = 0
        for hub in top10_hubs:
            # Find the top-20 spoke ports by demand volume for this hub
            hub_demand_pairs = [
                (d.weekly_teu, d.origin if d.destination == hub else d.destination)
                for d in problem.demands
                if d.origin == hub or d.destination == hub
            ]
            hub_demand_pairs.sort(reverse=True)
            top_spokes = list(dict.fromkeys(p for _, p in hub_demand_pairs[:40]))[:20]

            if not top_spokes:
                continue

            # Create 4-service loops: hub + 5 spokes each
            loop_size = 5
            for start in range(0, min(len(top_spokes), 20), loop_size):
                batch = top_spokes[start:start + loop_size]
                if len(batch) < 2:
                    continue
                route = [hub] + batch + [hub]  # loop back to hub

                # Calculate total demand for this hub loop
                loop_demand = sum(
                    d.weekly_teu for d in problem.demands
                    if all(p in route for p in [d.origin, d.destination])
                )

                # Size based on actual demand
                if loop_demand > 8000:
                    capacity = 14000
                    weekly_cost = 280_000
                elif loop_demand > 4000:
                    capacity = 10000
                    weekly_cost = 180_000
                else:
                    capacity = 8000
                    weekly_cost = 150_000

                vessel_class = map_capacity_to_vessel_class(capacity)
                services.append(Service(
                    id=sid, ports=route,
                    capacity=capacity, weekly_cost=weekly_cost, cycle_time=21,
                    vessel_class=vessel_class
                ))
                sid += 1
                loop_count += 1
        logger.info("hub_loop_services_added", count=loop_count)

        # ── C: Hub-to-hub trunk routes ──────────────────────────────────
        trunk_count = 0
        for i in range(len(top10_hubs)):
            for j in range(i + 1, len(top10_hubs)):
                vessel_class = map_capacity_to_vessel_class(12000)
                services.append(Service(
                    id=sid, ports=[top10_hubs[i], top10_hubs[j]],
                    capacity=12000, weekly_cost=200_000, cycle_time=14,
                    vessel_class=vessel_class
                ))
                sid += 1
                trunk_count += 1
        logger.info("trunk_services_added", count=trunk_count)

        # ── D: Feeder services — every spoke to best hub ────────────────
        # Essential for transshipment: spoke -> hub -> destination.
        spoke_ports = [p.id for p in problem.ports if p.id not in hub_set]

        # Demand-weighted hub affinity for each spoke
        hub_affinity: Dict[int, Dict[int, float]] = defaultdict(lambda: defaultdict(float))
        for d in problem.demands:
            if d.origin in hub_set and d.destination not in hub_set:
                hub_affinity[d.destination][d.origin] += d.weekly_teu
            if d.destination in hub_set and d.origin not in hub_set:
                hub_affinity[d.origin][d.destination] += d.weekly_teu

        feeder_count = 0
        for spoke in spoke_ports:
            hub_flows = hub_affinity.get(spoke, {})
            # Connect to top-2 hubs (for redundancy and better MILP routing)
            best_hubs = sorted(hub_flows, key=hub_flows.get, reverse=True)[:2]
            if not best_hubs:
                best_hubs = top10_hubs[:1]

            for best_hub in best_hubs:
                if best_hub == spoke:
                    continue

                # Calculate total demand for this spoke-hub pair
                spoke_demand = sum(
                    d.weekly_teu for d in problem.demands
                    if (d.origin == spoke and d.destination == best_hub) or
                       (d.origin == best_hub and d.destination == spoke)
                )

                # Size vessel based on demand with calibrated sizing
                if spoke_demand > 5000:
                    target_capacity = spoke_demand * 1.2  # 20% buffer for high-demand
                    standard_sizes = [4500, 8000, 10000, 14000]
                elif spoke_demand > 2000:
                    target_capacity = spoke_demand * 1.3  # 30% buffer for medium-demand
                    standard_sizes = [2000, 4500, 8000]
                elif spoke_demand > 500:
                    target_capacity = spoke_demand * 1.5  # 50% buffer for low-demand
                    standard_sizes = [500, 1000, 2000, 4500]
                else:
                    target_capacity = 500  # Minimum viable size
                    standard_sizes = [500, 1000]

                closest_size = min(standard_sizes, key=lambda x: abs(x - target_capacity))

                vessel_class = map_capacity_to_vessel_class(closest_size)
                # Scale cost proportionally
                weekly_cost = 70_000 * (closest_size / 4000)

                services.append(Service(
                    id=sid, ports=[spoke, best_hub],
                    capacity=closest_size, weekly_cost=weekly_cost, cycle_time=7,
                    vessel_class=vessel_class
                ))
                sid += 1
                feeder_count += 1
        logger.info("feeder_services_added", count=feeder_count)

        # ── E: Heuristic base candidate pool ───────────────────────────

        generator = CandidateServiceGenerator(problem)
        generator._service_id_counter = sid
        base_services = generator.generate_services(num_services=150)
        services.extend(base_services)
        logger.info("heuristic_services_added", count=len(base_services))

        logger.info("candidate_services_generated", num_services=len(services))
        return services

    # ------------------------------------------------------------------
    # Main pipeline
    # ------------------------------------------------------------------
    def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        logger.info("service_generator_agent_started", agent=self.name)
        problem: Problem = input_data["problem"]

        num_ports    = len(problem.ports)
        num_lanes    = len(problem.demands)
        total_demand = sum(d.weekly_teu for d in problem.demands)
        avg_demand   = total_demand / num_lanes if num_lanes else 0
        median_demand = sorted([d.weekly_teu for d in problem.demands])[num_lanes // 2] if num_lanes else 0

        top_demands  = sorted(problem.demands, key=lambda d: d.weekly_teu, reverse=True)
        top3_teu     = sum(d.weekly_teu for d in top_demands[:3])
        top3_share   = round(top3_teu / total_demand * 100, 1) if total_demand else 0
        top500_share = round(sum(d.weekly_teu for d in top_demands[:500]) / total_demand * 100, 1) if total_demand else 0

        hub_detector = HubDetector(problem)
        hubs         = hub_detector.detect_hubs(top_k=20)
        hub_ids_str  = ", ".join(str(h) for h in hubs[:10])
        spoke_count  = max(0, num_ports - 20)

        # Correct strategy selection: based on demand dispersion
        if median_demand <= 10 and num_lanes > 1000:
            archetype = "HYBRID"
            rationale = (
                f"Median demand is only {median_demand} TEU/lane across {num_lanes} lanes — "
                f"consolidation via hubs is essential. Top-500 corridors ({top500_share}% of demand) "
                f"served direct; remaining {num_lanes-500} low-demand corridors served via hub transshipment."
            )
        elif top3_share > 35:
            archetype = "HUB-AND-SPOKE"
            rationale = (
                f"Top-3 share {top3_share}% indicates concentrated demand — "
                f"hub trunk routes between [{hub_ids_str}] form the backbone."
            )
        else:
            archetype = "HYBRID"
            rationale = (
                f"Top-3 share {top3_share}% with avg {avg_demand:.1f} TEU/lane — "
                f"direct services for top-500 corridors plus hub routing for the rest."
            )

        corridor_table = "\n".join(
            f"  {i+1}. Port {d.origin:>5} -> Port {d.destination:>5}: "
            f"{d.weekly_teu:>8,.0f} TEU/wk"
            for i, d in enumerate(top_demands[:5])
        )

        prompt = (
            f"Liner shipping service design for {num_ports}-port network.\n\n"
            f"NETWORK STATS:\n"
            f"  Ports: {num_ports}, Lanes: {num_lanes}, Median demand/lane: {median_demand} TEU\n"
            f"  Total demand: {total_demand:,.0f} TEU, Avg: {avg_demand:.1f} TEU/lane\n"
            f"  Top-3 share: {top3_share}%, Top-500 share: {top500_share}%\n"
            f"  Hub ports: [{hub_ids_str}] ({len(hubs)} detected)\n\n"
            f"TOP-5 CORRIDORS:\n{corridor_table}\n\n"
            f"ARCHETYPE: {archetype}\n"
            f"RATIONALE: {rationale}\n\n"
            f"In 2 sentences: (1) confirm archetype citing median demand {median_demand} TEU "
            f"and total {total_demand:,.0f} TEU; "
            f"(2) expected GA retention out of ~{len(problem.services) if problem.services else 800} candidates."
        )

        try:
            strategy = self.call_llm(prompt, temperature=0.1)
        except Exception:
            strategy = (
                f"Strategy: {'C' if archetype == 'HYBRID' else 'A'}\n"
                f"Selected: {'hybrid' if archetype == 'HYBRID' else 'hub_and_spoke'}\n"
                f"Reason 1: {rationale}\n"
                f"Reason 2: {num_ports} ports x {num_lanes} lanes -> hub ports [{hub_ids_str}].\n"
                f"Hub Ports: [{hub_ids_str}]"
            )

        # ── Generate structured archetype params from LLM + validation ──
        try:
            json_prompt = prompt + (
                "\n\nReturn ONLY valid JSON (no markdown, no preamble):\n"
                '{"direct_ratio": <0.05-0.80>, "hub_loop_ratio": <0.05-0.80>, '
                '"feeder_ratio": <0.05-0.80>, "trunk_ratio": <0.05-0.80>, '
                '"vessel_bias": "small"|"balanced"|"large", '
                '"hub_focus": ["PORT_ID", ...], '
                '"notes": "<brief rationale>"}'
            )
            raw_json = self.call_llm(json_prompt, temperature=0.1)
            self._metrics["llm_calls"] += 1
            # ⚡ P+1E trace: log raw LLM response
            logger.info("p1e_raw_svcgen", raw_len=len(raw_json), raw_preview=raw_json[:200])
            import json as _json
            import re as _re
            text = raw_json.strip()
            text = _re.sub(r"^```[a-zA-Z]*\n?", "", text)
            text = _re.sub(r"\n?```$", "", text)
            try:
                parsed = _json.loads(text.strip())
                self._metrics["json_parse_success"] += 1
            except _json.JSONDecodeError:
                m = _re.search(r"\{.*\}", text, _re.DOTALL)
                parsed = _json.loads(m.group()) if m else {}
                if parsed:
                    self._metrics["json_parse_success"] += 1
            # ⚡ Phase P+1C: Track whether parsing succeeded for correct log tag.
            # Previously always logged "AI_VALIDATED" even when the validator
            # internally fell back to defaults — creating contradictory audit trail.
            parse_succeeded = bool(parsed)
            archetype_params = validate_archetype_params(parsed)
            self._metrics["validator_executed"] += 1
            tag = "AI_FALLBACK" if not parse_succeeded else "AI_VALIDATED"
            logger.info("archetype_params_generated", tag=tag, params=archetype_params, parse_ok=parse_succeeded)
        except Exception:
            archetype_params = dict(DEFAULT_ARCHETYPE_PARAMS)
            self._metrics["fallback_count"] += 1
            logger.info("archetype_params_generated", tag="AI_FALLBACK", reason="LLM parse failed, using defaults")

        services         = self.generate_services(problem, archetype_params=archetype_params)
        problem.services = services
        logger.info("services_attached_to_problem", count=len(services))

        return {
            "agent":              self.name,
            "strategy":           strategy,
            "services_generated": len(services),
            "services":           services,
            "archetype_params":   archetype_params,
            "llm_runtime_metrics": dict(self._metrics),
        }