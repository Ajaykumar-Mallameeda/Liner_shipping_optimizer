from dataclasses import dataclass
from typing import List, Dict


@dataclass
class Port:
    id: str  # Changed from int to str to match JSON data
    name: str
    latitude: float
    longitude: float
    handling_cost: float = 0
    draft: float = 0
    port_call_cost: float = 0
    transshipment_cost: float = 0
    variable_port_call_cost: float = 0


@dataclass
class Service:
    id: str  # Globally unique service identifier (e.g., "asia_svc_001")
    ports: List[str]  # Changed to str to match Port IDs
    capacity: float
    weekly_cost: float
    cycle_time: int = 7
    speed: float = 18
    fuel_cost: float = 0
    vessel_class: str = ""  # Added for fuel cost calculation

    def __post_init__(self):
        # Backward-compat: accept int IDs by stringifying them.
        if not isinstance(self.id, str):
            self.id = str(self.id)


@dataclass
class Demand:
    origin: str  # Changed to str to match Port IDs
    destination: str  # Changed to str
    weekly_teu: float
    revenue_per_teu: float


class Problem:

    def __init__(
        self,
        ports: List[Port],
        services: List[Service],
        demands: List[Demand],
        distance_matrix: Dict = None
    ):
        self.ports = ports
        self.services = services
        self.demands = demands
        self.distance_matrix = distance_matrix 

        if self.distance_matrix is None:
            raise ValueError("Problem must include distance_matrix")