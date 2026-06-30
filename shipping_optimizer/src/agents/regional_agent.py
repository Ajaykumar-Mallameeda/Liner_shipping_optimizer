import re
import time
import logging
from typing import Dict, Any, List
from src.llm.evaluator                  import LLMEvaluator
from src.agents.base                    import BaseAgent
from src.agents.service_generator_agent import ServiceGeneratorAgent
from src.optimization.data              import Problem, Service
from src.optimization.hierarchical_ga   import HierarchicalGA
from src.optimization.hub_milp          import HubMILP
from src.services.hub_detector          import HubDetector
from src.utils.fuel_cost                import map_capacity_to_vessel_class
from src.validation.regional_policy_validator import validate_regional_policy, DEFAULT_REGIONAL_POLICY

logger = logging.getLogger(__name__)

# ── Shared cost constants — identical in GA and MILP ──────────────────
TRANSSHIP_COST_PER_TEU = 80.0
PORT_COST_PER_TEU      = 0.0  # Use dataset port costs only
ALPHA_UNSERVED         = 300.0
MIN_COVERAGE_FLOOR     = 0.0    
MAX_TRANSFER_PAIRS     = 2000   

class RegionalAgent(BaseAgent):

    def __init__(self, name: str, region: str, model: str):
        super().__init__(name=name, role=f"Regional Optimizer - {region}", model=model)
        self.region    = region
        self.evaluator = LLMEvaluator()

    def get_system_prompt(self) -> str:
        return (
            f"You are a liner shipping network optimisation analyst for the {self.region} region.\n\n"
            "Your output is consumed by the Global Decision Agent for network-wide coordination.\n"
            "1. Every claim must cite a specific number from the data.\n"
            "2. No vague language: 'consider', 'explore', 'may', 'could potentially'.\n"
            "3. Strategy reasons must name specific port IDs or TEU volumes.\n"
            "4. Improvement actions must be specific and measurable."
        )

    def is_valid_explanation(self, text: str) -> bool:
        required = ["Verdict:", "Strength", "Weakness", "Improvement"]
        return all(r in text for r in required) and bool(re.search(r"\d{2,}", text))

    # ------------------------------------------------------------------ #
    #  Hub-based cluster decomposition                                      #
    # ------------------------------------------------------------------ #
    def split_by_hubs(self, problem: Problem, num_hubs: int = 5) -> Dict:
        hub_detector = HubDetector(problem)
        hubs         = hub_detector.detect_hubs(top_k=num_hubs)
        clusters     = {h: [] for h in hubs}
        for p in problem.ports:
            closest_hub = min(
                hubs,
                key=lambda h: problem.distance_matrix.get(h, {}).get(p.id, 1e9),
            )
            clusters[closest_hub].append(p)
        return clusters

    # ------------------------------------------------------------------ #
    #  Smart service filter — raised cap, same margin check                 #
    # ------------------------------------------------------------------ #
    def _filter_services(self, problem: Problem) -> Problem:
        """
        Keep services covering demand corridors with positive margin.
        """
        corridor_set = {(d.origin, d.destination) for d in problem.demands}
        kept = []
        for svc in problem.services:
            port_set = set(svc.ports)
            covers   = any(o in port_set and d in port_set for (o, d) in corridor_set)
            margin   = (svc.capacity * 0.5 * 150) > svc.weekly_cost
            if covers and margin:
                kept.append(svc)

        num_ports    = len(problem.ports)
        max_services = max(400, num_ports)
        kept = sorted(kept, key=lambda s: s.capacity / (s.weekly_cost + 1), reverse=True)[:max_services]

        problem.services = kept
        logger.info("services_filtered", region=self.region, count=len(kept))
        return problem

    # ------------------------------------------------------------------ #
    #  Main pipeline                                                        #
    # ------------------------------------------------------------------ #
    def process(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        t0 = time.perf_counter()
        logger.info("regional_agent_started", agent=self.name, region=self.region)
        problem: Problem = input_data["problem"]

        # Capture regional total demand BEFORE any splitting/modification
        total_demand = sum(d.weekly_teu for d in problem.demands)
        num_ports    = len(problem.ports)
        num_lanes    = len(problem.demands)
        avg_demand   = total_demand / num_lanes if num_lanes else 0
        median_demand = sorted([d.weekly_teu for d in problem.demands])[num_lanes // 2] if num_lanes else 0

        top_demands  = sorted(problem.demands, key=lambda d: d.weekly_teu, reverse=True)
        top5         = top_demands[:5]
        top3_teu     = sum(d.weekly_teu for d in top_demands[:3])
        top3_share   = round(top3_teu / total_demand * 100, 1) if total_demand else 0

        corridor_table = "\n".join(
            f"  {i+1}. Port {d.origin:>5} -> Port {d.destination:>5}: "
            f"{d.weekly_teu:>8,.0f} TEU/wk  "
            f"({d.weekly_teu / total_demand * 100:.1f}% of regional demand)"
            for i, d in enumerate(top5)
        )

        hub_detector  = HubDetector(problem)
        detected_hubs = hub_detector.detect_hubs(top_k=5)
        hub_ids_str   = ", ".join(str(h) for h in detected_hubs)

        # Strategy based on demand dispersion 
        if median_demand <= 10 and num_lanes > 500:
            strat_code = "C"
            strat_name = "hybrid"
            decision_rule = (
                f"Select C (Hybrid): median demand {median_demand} TEU/lane with {num_lanes} lanes "
                f"-> consolidation via hub routing essential for low-demand corridors."
            )
        elif top3_share > 35:
            strat_code = "A"
            strat_name = "hub_and_spoke"
            decision_rule = f"Select A (Hub-and-spoke): top-3 share {top3_share}% > 35%."
        else:
            strat_code = "C"
            strat_name = "hybrid"
            decision_rule = (
                f"Select C (Hybrid): top-3 share {top3_share}% with avg {avg_demand:.1f} TEU/lane."
            )

        strategy_prompt = (
            f"REGIONAL DATA - {self.region.upper()}:\n"
            f"  Ports: {num_ports}, Lanes: {num_lanes}, Median demand: {median_demand} TEU/lane\n"
            f"  Total demand: {total_demand:,.0f} TEU/wk, Top-3 share: {top3_share}%\n"
            f"  Hub ports: [{hub_ids_str}]\n\n"
            f"TOP-5 CORRIDORS:\n{corridor_table}\n\n"
            f"DECISION RULE: {decision_rule}\n\n"
            f"STRICT FORMAT:\n"
            f"Strategy: <A | B | C>\n"
            f"Selected: <hub_and_spoke | direct | hybrid>\n"
            f"Reason 1: [cite median demand {median_demand} TEU/lane and >=1 port ID]\n"
            f"Reason 2: [cite port count {num_ports} and lane count {num_lanes}]\n"
            f"Hub Ports: [{hub_ids_str}]"
        )

        try:
            strategy = self.call_llm(strategy_prompt, temperature=0.1)
            if not any(c.isdigit() for c in strategy):
                strategy += f"\nReason 3: Demand {total_demand:,.0f} TEU across {num_ports} ports."
        except Exception:
            strategy = (
                f"Strategy: {strat_code}\nSelected: {strat_name}\n"
                f"Reason 1: Median demand {median_demand} TEU/lane across {num_lanes} lanes "
                f"-> hub consolidation required for {num_lanes-500} low-demand corridors.\n"
                f"Reason 2: {num_ports} ports x {num_lanes} lanes -> hub ports [{hub_ids_str}].\n"
                f"Hub Ports: [{hub_ids_str}]"
            )

        # ── Service generation ─────────────────────────────────────────
        svc_agent  = ServiceGeneratorAgent(name="svc_gen", model=self.model)
        svc_result = svc_agent.process({"problem": problem})
        services   = svc_result["services"]
        services_generated = len(services)
        svc_archetype_params = svc_result.get("archetype_params", {})

        norm: List[Service] = []
        # Region-prefix ensures globally unique service IDs (e.g. asia_svc_001)
        region_prefix = self.region.lower().replace(" ", "_")
        for i, s in enumerate(services):
            if isinstance(s, Service):
                norm.append(s)
            else:
                capacity = s.get("capacity", 5000)
                vessel_class = s.get("vessel_class", map_capacity_to_vessel_class(capacity))
                norm.append(Service(
                    id=s.get("id", i), ports=s["ports"],
                    capacity=capacity,
                    weekly_cost=s.get("weekly_cost", 150_000),
                    cycle_time=s.get("cycle_time", 14),
                    vessel_class=vessel_class
                ))
        # Namespace service IDs with region prefix to avoid global collisions
        for idx, s in enumerate(norm):
            s.id = f"{region_prefix}_svc_{idx:03d}"
        problem.services = norm

        # ── Smart service filter ───────────────────────────────────────
        problem           = self._filter_services(problem)
        services_filtered = len(problem.services)

        # ── HierarchicalGA ─────────────────────────────────────────────
        logger.info("hierarchical_ga_started")
        try:
            ga = HierarchicalGA(
                problem,
                w_profit = getattr(problem, "profit_weight", 0.5),
                w_coverage = getattr(problem, "coverage_weight", 0.4),
                w_cost = getattr(problem, "cost_weight", 0.1),
                alpha_unserved         = ALPHA_UNSERVED,
                max_runtime_sec        = 55.0,
                transship_cost_per_teu = TRANSSHIP_COST_PER_TEU,
                port_cost_per_teu      = PORT_COST_PER_TEU,
                objective_mode         = getattr(problem, "objective_mode", "profit_first"),
            )
            chromosome        = ga.run()
            services_selected = sum(chromosome["services"])
            logger.info("ga_complete", services_selected=services_selected)
        except Exception as e:
            logger.error("ga_failed", region=self.region, error=str(e))
            # Fallback to empty chromosome
            chromosome = {
                "services": [0] * len(problem.services),
                "frequencies": [0] * len(problem.services),
                "coverage_estimate": 0.0,
                "skip_milp": False
            }
            services_selected = 0
        
        # ── MILP decomposition by hub clusters ─────────────────────────
        logger.info("milp_decomposition_started")
        clusters        = self.split_by_hubs(problem)
        cluster_results = []

        for hub, ports in clusters.items():
            cluster_port_ids = {p.id for p in ports}
            cluster_demands  = [
                d for d in problem.demands
                if d.origin in cluster_port_ids or d.destination in cluster_port_ids
            ]
            if not cluster_demands:
                continue

            sub = Problem(
                ports           = ports,
                services        = problem.services,
                demands         = cluster_demands,
                distance_matrix = problem.distance_matrix,
            )
            milp = HubMILP(
                sub,
                chromosome,
                transship_cost_per_teu = TRANSSHIP_COST_PER_TEU,
                port_cost_per_teu      = PORT_COST_PER_TEU,
                alpha_unserved         = ALPHA_UNSERVED,
                min_coverage           = MIN_COVERAGE_FLOOR,
                max_transfer_pairs     = MAX_TRANSFER_PAIRS,
            )
            logger.info("milp_solve_started", hub=hub, cluster_ports=len(ports))
            try:
                result = milp.solve()
                logger.info("milp_solve_complete", hub=hub, status=result.get("status", "unknown"))
                cluster_results.append(result)
            except Exception as e:
                logger.error("milp_solve_failed", hub=hub, error=str(e))
                # Add fallback result to maintain pipeline integrity
                cluster_results.append({
                    "status": "Failed",
                    "profit": 0.0,
                    "cost": 0.0,
                    "transship_cost": 0.0,
                    "port_cost": 0.0,
                    "total_cost": 0.0,
                    "coverage": 0.0,
                    "satisfied_demand": 0.0,
                    "direct_demand": 0.0,
                    "transship_demand": 0.0,
                    "total_demand": sum(d.weekly_teu for d in sub.demands),
                    "unserved_demand": sum(d.weekly_teu for d in sub.demands),
                    "selected_services": []
                })

        # Aggregate services and clusters
        # Deduplicate by service id — the same service can be selected in
        # multiple hub clusters; merge entries by summing load and economics.
        merged: Dict[str, Dict] = {}
        for r in cluster_results:
            if "selected_services" in r:
                for svc in r["selected_services"]:
                    sid = svc.get("id", "?")
                    if sid in merged:
                        prev = merged[sid]
                        prev["load"]       = (prev.get("load", 0.0) or 0.0) + (svc.get("load", 0.0) or 0.0)
                        prev["revenue"]    = (prev.get("revenue", 0.0) or 0.0) + (svc.get("revenue", 0.0) or 0.0)
                        prev["cost"]       = (prev.get("cost", 0.0) or 0.0) + (svc.get("cost", 0.0) or 0.0)
                        prev["vessel_cost"]= (prev.get("vessel_cost", 0.0) or 0.0) + (svc.get("vessel_cost", 0.0) or 0.0)
                        prev["fuel_cost"]  = (prev.get("fuel_cost", 0.0) or 0.0) + (svc.get("fuel_cost", 0.0) or 0.0)
                        prev["port_cost"]  = (prev.get("port_cost", 0.0) or 0.0) + (svc.get("port_cost", 0.0) or 0.0)
                        prev["weekly_profit"] = (prev.get("weekly_profit", 0.0) or 0.0) + (svc.get("weekly_profit", 0.0) or 0.0)
                    else:
                        merged[sid] = dict(svc)
        # Attach region and freeze
        all_selected_services = []
        for sid, svc in merged.items():
            svc["region"] = self.region
            # Recompute margin from totals so it remains consistent
            rev = svc.get("revenue", 0.0) or 0.0
            cst = svc.get("cost", 0.0) or 0.0
            svc["weekly_profit"] = rev - cst
            svc["margin_pct"] = round(
                (rev - cst) / rev * 100, 2
            ) if rev > 0 else 0.0
            all_selected_services.append(svc)

        # ── Aggregate — use regional total_demand as denominator ────────
        # (Not sum of cluster total_demand which double-counts cross-cluster OD)
        profit         = sum(r["profit"]           for r in cluster_results)
        operating_cost = sum(r["cost"]             for r in cluster_results)
        fuel_cost      = sum(r.get("fuel_cost", 0) for r in cluster_results)
        transship_cost = sum(r["transship_cost"]   for r in cluster_results)
        port_cost      = sum(r["port_cost"]        for r in cluster_results)
        total_cost     = sum(r["total_cost"]       for r in cluster_results)
        satisfied      = sum(r["satisfied_demand"] for r in cluster_results)
        unserved_teu   = sum(r["unserved_demand"]  for r in cluster_results)

        # Cap satisfied at total_demand to avoid >100% coverage
        satisfied = min(satisfied, total_demand)
        coverage  = satisfied / total_demand * 100 if total_demand else 0.0

        # Derived metrics
        uncovered_pct      = round(100 - coverage, 1)
        profit_per_service = round(profit / services_selected, 0) if services_selected else 0
        cost_per_service   = round(total_cost / services_selected, 0) if services_selected else 0
        profit_margin_pct  = round(
            profit / (profit + total_cost) * 100, 1
        ) if (profit + total_cost) > 0 else 0
        uncovered_teu_abs  = total_demand * (100 - coverage) / 100

        top_unserved  = top_demands[0] if top_demands else None
        unserved_line = (
            f"Port {top_unserved.origin} -> Port {top_unserved.destination}: "
            f"{top_unserved.weekly_teu:,.0f} TEU/week"
            if top_unserved else "N/A"
        )

        # ── LLM explanation ────────────────────────────────────────────
        explanation_prompt = (
            f"Maritime logistics analyst evaluating {self.region.upper()} region.\n\n"
            f"SOLVER RESULTS:\n"
            f"  Services generated/filtered/selected: {services_generated}/{services_filtered}/{services_selected}\n"
            f"  Weekly profit: ${profit:,.0f} | Annual: ${profit * 52:,.0f}\n"
            f"  Cost: Operating ${operating_cost:,.0f} | Transship ${transship_cost:,.0f} | Port ${port_cost:,.0f}\n"
            f"  Margin: {profit_margin_pct}% | Profit/svc: ${profit_per_service:,.0f}/wk\n"
            f"  Coverage: {coverage:.1f}% | Unserved: {uncovered_pct:.1f}% ({unserved_teu:,.0f} TEU/wk)\n"
            f"  Hub ports: [{hub_ids_str}]\n\n"
            f"TOP-5 CORRIDORS:\n{corridor_table}\n\n"
            f"STRICT FORMAT:\n"
            f"Verdict: <Good | Moderate | Poor>\n"
            f"  [Cite margin {profit_margin_pct}% and coverage {coverage:.1f}%]\n\n"
            f"Strengths:\n"
            f"- [Cite profit ${profit:,.0f} and profit/service]\n"
            f"- [Cite coverage {coverage:.1f}% and satisfied TEU]\n\n"
            f"Weaknesses:\n"
            f"- [Cite unserved {uncovered_pct:.1f}% = {unserved_teu:,.0f} TEU/wk]\n"
            f"- [Cite transship ${transship_cost:,.0f} and port ${port_cost:,.0f}]\n\n"
            f"Improvement Actions:\n"
            f"- [Action 1: target {unserved_line}]\n"
            f"- [Action 2: hub [{hub_ids_str}] expansion for {uncovered_pct:.1f}% gap]"
        )

        try:
            explanation = ""
            for _ in range(2):
                explanation = self.call_llm(explanation_prompt, temperature=0.1)
                if self.is_valid_explanation(explanation):
                    break
            if not self.is_valid_explanation(explanation):
                raise ValueError("invalid")
        except Exception:
            verdict = (
                "Good" if profit_margin_pct > 25 else
                "Moderate" if profit_margin_pct > 15 else "Poor"
            )
            explanation = (
                f"Verdict: {verdict}\n"
                f"  Profit margin {profit_margin_pct}% with coverage {coverage:.1f}%.\n\n"
                f"Strengths:\n- Weekly profit ${profit:,.0f} ({services_selected} services) -> ${profit_per_service:,.0f}/service/week.\n- Satisfied {satisfied:,.0f} TEU/wk at {coverage:.1f}% coverage.\n\n"
                f"Weaknesses:\n- {uncovered_pct:.1f}% unserved ({unserved_teu:,.0f} TEU/wk).\n- Transshipment ${transship_cost:,.0f} + port ${port_cost:,.0f}/wk.\n\n"
                f"Improvement Actions:\n- Add services to {unserved_line} corridor.\n- Expand hub [{hub_ids_str}] by {int(uncovered_pct/5 + 1)} services."
            )

        elapsed = time.perf_counter() - t0

        # ── Regional policy validation ──────────────────────────────────
        try:
            derived = {}
            hub_detector_local = HubDetector(problem)
            detected = hub_detector_local.detect_hubs(top_k=5)
            top_demands_reg = sorted(problem.demands, key=lambda d: d.weekly_teu, reverse=True)

            num_lanes_reg = len(problem.demands)
            density_val = num_lanes_reg / (max(1, len(problem.ports)) * (max(1, len(problem.ports) - 1) / 2)) * 100 if len(problem.ports) > 1 else 0
            density_level = "very_dense" if density_val > 100 else "dense" if density_val > 50 else "moderate" if density_val > 20 else "sparse"

            if density_level in ("very_dense", "dense"):
                vessel_bias_val = "large"
            elif density_level == "moderate":
                vessel_bias_val = "balanced"
            else:
                vessel_bias_val = "small"

            top3_teu_val = sum(d.weekly_teu for d in top_demands_reg[:3])
            top3_share_val = top3_teu_val / max(1, total_demand) * 100 if total_demand else 0

            if top3_share_val > 35:
                cov_base, prof_base = 0.85, 0.15
            elif top3_share_val > 15:
                cov_base, prof_base = 0.65, 0.35
            else:
                cov_base, prof_base = 0.45, 0.55

            if density_level in ("very_dense",):
                cov_base = max(0.15, cov_base - 0.10)
                prof_base = min(0.85, prof_base + 0.10)

            margin_base = {"very_dense": 0.03, "dense": 0.05, "moderate": 0.08, "sparse": 0.10}.get(density_level, 0.05)
            if profit_margin_pct < 10:
                margin_base += 0.05

            regional_policy_data = {
                "coverage_priority": round(cov_base, 2),
                "profit_priority": round(prof_base, 2),
                "min_service_margin": round(min(0.30, margin_base), 2),
                "vessel_bias": vessel_bias_val,
                "hub_focus": [str(h) for h in detected_hubs[:3]],
                "corridor_focus": [[str(top_demands_reg[0].origin), str(top_demands_reg[0].destination)]] if top_demands_reg else [],
                "notes": f"Region {self.region}: dens={density_level}, top3={top3_share_val:.1f}%. Total demand {total_demand:,.0f} TEU/wk.",
                "rationale": [
                    f"density={density_level} -> vessel_bias={vessel_bias_val}",
                    f"margin adjusted for {profit_margin_pct:.1f}% profit margin -> {min(0.30, margin_base):.2f}",
                ],
            }
            validated_policy = validate_regional_policy(
                regional_policy_data,
                valid_port_ids={str(p.id) for p in problem.ports},
                source="rule-based",
            )
            logger.info("regional_policy_validated", tag="AI_VALIDATED", region=self.region, policy=validated_policy)
        except Exception as val_err:
            validated_policy = dict(DEFAULT_REGIONAL_POLICY)
            logger.info("regional_policy_validated", tag="AI_FALLBACK", region=self.region, error=str(val_err))

        return {
            "agent":               self.name,
            "region":              self.region,
            "status":              cluster_results[0]["status"] if cluster_results else "No clusters",
            "services_generated":  services_generated,
            "services_filtered":   services_filtered,
            "services_selected":   services_selected,
            "weekly_profit":       profit,
            "annual_profit":       profit * 52,
            "operating_cost":      operating_cost,
            "fuel_cost":           fuel_cost,
            "transship_cost":      transship_cost,
            "port_cost":           port_cost,
            "total_cost":          total_cost,
            "coverage_percent":    coverage,
            "satisfied_demand":    satisfied,
            "unserved_demand":     unserved_teu,
            "total_demand":        total_demand,
            "profit_margin_pct":   profit_margin_pct,
            "profit_per_service":  profit_per_service,
            "cost_per_service":    cost_per_service,
            "uncovered_teu":       uncovered_teu_abs,
            "hub_ports":           detected_hubs,
            "archetype_params":    svc_archetype_params,
            "regional_policy":     validated_policy,
            "strategy":            strategy,
            "explanation":         explanation,
            "selected_services":   all_selected_services,
            "elapsed_sec":         round(elapsed, 1),
        }