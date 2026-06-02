import pandas as pd
from pathlib import Path
from src.optimization.data import Port
from src.optimization.data import Demand

class NetworkLoader:

    
    def __init__(self, data_dir="data"):

        base = Path(__file__).resolve().parents[2]
        self.data_dir = base / "data" / "raw"

    # --------------------------------
    # Load ports
    # --------------------------------
    def load_ports(self):

        ports_file = self.data_dir / "ports.csv"

        df = pd.read_csv(ports_file, sep="\t")
        df.columns = [c.strip().lower() for c in df.columns]

        df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
        df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
        df["draft"] = pd.to_numeric(df["draft"], errors="coerce")
        df["costperfull"] = pd.to_numeric(df["costperfull"], errors="coerce")
        df["costperfulltrnsf"] = pd.to_numeric(df["costperfulltrnsf"], errors="coerce")
        df["portcallcostfixed"] = pd.to_numeric(df["portcallcostfixed"], errors="coerce")
        df["portcallcostperffe"] = pd.to_numeric(df["portcallcostperffe"], errors="coerce")

        df = df.dropna(subset=["latitude", "longitude"])

        ports = []

        for _, row in df.iterrows():

            ports.append(
                Port(
                    id=str(row["unlocode"]).strip(),
                    name=str(row["name"]).strip(),
                    latitude=float(row["latitude"]),
                    longitude=float(row["longitude"]),
                    handling_cost=float(row["costperfull"]) * 2.0 if pd.notna(row["costperfull"]) else 0.0,
                    draft=float(row["draft"]) if pd.notna(row["draft"]) else 0.0,
                    port_call_cost=float(row["portcallcostfixed"]) if pd.notna(row["portcallcostfixed"]) else 0.0,
                    transshipment_cost=float(row["costperfulltrnsf"]) * 2.0 if pd.notna(row["costperfulltrnsf"]) else 0.0,
                    variable_port_call_cost=float(row["portcallcostperffe"]) * 2.0 if pd.notna(row["portcallcostperffe"]) else 0.0
                )
            )

        return ports

    # --------------------------------
    # Load demand
    # --------------------------------
    def load_demands(self):

        demand_file = self.data_dir / "demand_world_large.csv"

        df = pd.read_csv(demand_file, sep="\t")
        df.columns = [c.strip() for c in df.columns]

        demands = []

        # Trade lane specific FFE to TEU conversion factors
        # Based on typical cargo mix for different regions
        FFE_TO_TEU_CONVERSIONS = {
            # Asia-Europe: Higher ratio of 40' containers (2.1)
            "AEJEA-GBSOU": 2.1, "AEJEA-DEHAM": 2.1, "AEJEA-NLRTM": 2.1, "AEJEA-ITGOA": 2.1,
            "CNSHA-GBSOU": 2.1, "CNSHA-DEHAM": 2.1, "CNSHA-NLRTM": 2.1, "CNSHA-ITGOA": 2.1,

            # Transpacific: Balanced mix (1.85)
            "CNSHA-USLAX": 1.85, "CNSHA-USAOS": 1.85, "CNSHA-USSEA": 1.85, "CNSHA-USA NY": 1.85,
            "JPTYO-USLAX": 1.85, "JPTYO-USAOS": 1.85, "JPTYO-USSEA": 1.85, "JPTYO-USA NY": 1.85,

            # Transatlantic: More 20' containers (1.75)
            "USLAX-GBSOU": 1.75, "USAOS-GBSOU": 1.75, "USNYC-DEHAM": 1.75, "USNYC-NLRTM": 1.75,

            # Intra-Asia: High 40' usage (2.0)
            "CNSHA-JPTYO": 2.0, "CNSHA-SGSGP": 2.0, "JPTYO-KRPUS": 2.0,

            # Latin America: Mixed (1.9)
            "BRSSZ-USLAX": 1.9, "BRSSZ-USAOS": 1.9, "MXVER-CNSHA": 1.9,
        }

        for _, row in df.iterrows():

            origin = str(row["Origin"]).strip()
            dest = str(row["Destination"]).strip()

            if origin == dest:
                continue

            # Get trade lane specific conversion factor, default to 2.0
            lane_key = f"{origin}-{dest}"
            ffe_to_teu_factor = FFE_TO_TEU_CONVERSIONS.get(lane_key, 2.0)

            # Convert FFE to TEU
            weekly_teu = float(row["FFEPerWeek"]) * ffe_to_teu_factor

            # Revenue_1 is $/FFE, convert to $/TEU
            revenue_per_teu = float(row["Revenue_1"]) * ffe_to_teu_factor

            demands.append(
                Demand(
                    origin=origin,
                    destination=dest,
                    weekly_teu=weekly_teu,
                    revenue_per_teu=revenue_per_teu
                )
            )

        return demands

    # --------------------------------
    # Load distance matrix
    # --------------------------------
    def load_distance_matrix(self):

        dist_file = self.data_dir / "distance_dense.csv"

        df = pd.read_csv(dist_file, sep="\t")
        df.columns = [c.strip().lower() for c in df.columns]

        matrix = {}

        for _, row in df.iterrows():

            o = str(row["fromunlocode"]).strip()
            d = str(row["tounlocode"]).strip()
            dist = float(row["distance"])

            matrix.setdefault(o, {})
            matrix[o][d] = dist

        return matrix

    # --------------------------------
    # MAIN LOADER
    # --------------------------------
    def load_network(self):

        ports = self.load_ports()
        demands = self.load_demands()
        distance_matrix = self.load_distance_matrix()

        port_ids = {p.id for p in ports}

        # ensure every port exists in matrix
        for pid in port_ids:
            distance_matrix.setdefault(pid, {})

        return {
            "ports": ports,
            "demands": demands,
            "distance_matrix": distance_matrix
        }
   
