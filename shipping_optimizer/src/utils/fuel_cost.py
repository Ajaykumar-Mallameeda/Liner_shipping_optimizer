"""
Fuel Cost Calculation Module for Liner Shipping Optimizer

Implements voyage fuel cost based on:
- Vessel class consumption rates
- Sailing distance
- Bunker fuel prices

Based on industry standard consumption figures.
"""

from typing import Dict
import logging

logger = logging.getLogger(__name__)

# Industry standard fuel consumption by vessel class
# Based on 2024 maritime industry data
# Consumption in tons per day at service speed
VESSEL_FUEL_CONSUMPTION = {
    "Feeder_450": {
        "capacity": 450,
        "consumption_tons_per_day": 15,
        "speed_knots": 16,
        "source": "Clarksons Research 2024"
    },
    "Feeder_800": {
        "capacity": 800,
        "consumption_tons_per_day": 25,
        "speed_knots": 17,
        "source": "Clarksons Research 2024"
    },
    "Panamax_1200": {
        "capacity": 1200,
        "consumption_tons_per_day": 35,
        "speed_knots": 18,
        "source": "Clarksons Research 2024"
    },
    "Panamax_2400": {
        "capacity": 2400,
        "consumption_tons_per_day": 55,
        "speed_knots": 19,
        "source": "Clarksons Research 2024"
    },
    "Post_panamax": {
        "capacity": 5000,
        "consumption_tons_per_day": 80,
        "speed_knots": 22,
        "source": "Clarksons Research 2024"
    },
    "Super_panamax": {
        "capacity": 8000,
        "consumption_tons_per_day": 100,
        "speed_knots": 23,
        "source": "Clarksons Research 2024"
    }
}

# Bunker fuel prices as of 2024
# Using IFO 380 (intermediate fuel oil 380 cSt) - most common for container vessels
# Price in USD per metric ton
BUNKER_PRICE_PER_TON = 600.0  # $/ton
BUNKER_PRICE_SOURCE = "Bunker Index 2024 Average"

def map_capacity_to_vessel_class(capacity: float) -> str:
    """Map service capacity to closest vessel class"""

    # Find the vessel class with closest capacity
    best_class = None
    min_diff = float('inf')

    for vessel_class, specs in VESSEL_FUEL_CONSUMPTION.items():
        diff = abs(capacity - specs["capacity"])
        if diff < min_diff:
            min_diff = diff
            best_class = vessel_class

    return best_class or "Post_panamax"  # Default fallback

def calculate_voyage_fuel_cost(
    distance_nm: float,
    vessel_class: str,
    bunker_price_per_ton: float = BUNKER_PRICE_PER_TON
) -> float:
    """
    Calculate fuel cost for a single voyage

    Args:
        distance_nm: Distance in nautical miles
        vessel_class: Vessel class from VESSEL_FUEL_CONSUMPTION
        bunker_price_per_ton: Fuel price in $/ton

    Returns:
        Fuel cost in USD for the voyage
    """

    if vessel_class not in VESSEL_FUEL_CONSUMPTION:
        logger.warning(f"Unknown vessel class: {vessel_class}, using Post_panamax")
        vessel_class = "Post_panamax"

    specs = VESSEL_FUEL_CONSUMPTION[vessel_class]

    # Calculate sailing days
    # Assuming vessel operates at service speed 90% of time (accounting for port time)
    sailing_days = distance_nm / (specs["speed_knots"] * 24 * 0.9)

    # Calculate fuel consumption in tons
    fuel_consumed_tons = sailing_days * specs["consumption_tons_per_day"]

    # Calculate cost
    fuel_cost = fuel_consumed_tons * bunker_price_per_ton

    return fuel_cost

def calculate_weekly_fuel_cost(
    service_route: list,
    distance_matrix: Dict,
    vessel_class: str,
    cycle_time_days: int = 7,
    bunker_price_per_ton: float = BUNKER_PRICE_PER_TON
) -> float:
    """
    Calculate weekly fuel cost for a service route

    Args:
        service_route: List of port UNLOCODEs in order
        distance_matrix: Distance matrix between ports
        vessel_class: Vessel class
        cycle_time_days: Days for one complete cycle
        bunker_price_per_ton: Fuel price in $/ton

    Returns:
        Weekly fuel cost in USD
    """

    if len(service_route) < 2:
        return 0.0

    # Calculate total distance for one cycle
    total_distance = 0.0

    for i in range(len(service_route) - 1):
        origin = service_route[i]
        dest = service_route[i + 1]

        # Get distance from matrix
        if origin in distance_matrix and dest in distance_matrix[origin]:
            total_distance += distance_matrix[origin][dest]
        else:
            logger.warning(f"No distance found for {origin} -> {dest}")
            # Use default distance if not found (500 nm for missing pairs)
            total_distance += 500.0

    # Calculate fuel cost for one cycle
    cycle_fuel_cost = calculate_voyage_fuel_cost(
        total_distance, vessel_class, bunker_price_per_ton
    )

    # Convert to weekly cost (cycles per week = 7 / cycle_time_days)
    weekly_fuel_cost = cycle_fuel_cost * (7.0 / cycle_time_days)

    return weekly_fuel_cost

def get_vessel_consumption_rate(vessel_class: str) -> float:
    """Get daily fuel consumption in tons for a vessel class"""

    if vessel_class not in VESSEL_FUEL_CONSUMPTION:
        logger.warning(f"Unknown vessel class: {vessel_class}")
        return VESSEL_FUEL_CONSUMPTION["Post_panamax"]["consumption_tons_per_day"]

    return VESSEL_FUEL_CONSUMPTION[vessel_class]["consumption_tons_per_day"]

def get_vessel_speed(vessel_class: str) -> float:
    """Get service speed in knots for a vessel class"""

    if vessel_class not in VESSEL_FUEL_CONSUMPTION:
        logger.warning(f"Unknown vessel class: {vessel_class}")
        return VESSEL_FUEL_CONSUMPTION["Post_panamax"]["speed_knots"]

    return VESSEL_FUEL_CONSUMPTION[vessel_class]["speed_knots"]