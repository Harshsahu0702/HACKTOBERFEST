from pathlib import Path
import json
from collections import defaultdict


# ============================================================
# PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

REID_DIR = PROJECT_ROOT / "runs" / "reid"

FEATURES_FILE = REID_DIR / "vehicle_features.json"
MATCHES_FILE = REID_DIR / "cross_camera_matches.json"

OUTPUT_FILE = REID_DIR / "validated_global_vehicle_paths.json"
RECORDS_FILE = REID_DIR / "validated_global_vehicle_records.json"


# ============================================================
# CAMERA -> JUNCTION
# ============================================================

CAMERA_TO_JUNCTION = {}

for n in range(1, 6):
    CAMERA_TO_JUNCTION[f"camera_{n:02d}"] = "S01"

for n in range(10, 16):
    CAMERA_TO_JUNCTION[f"camera_{n:02d}"] = "S03"

for n in range(16, 41):
    CAMERA_TO_JUNCTION[f"camera_{n:02d}"] = "S04"


# ============================================================
# CONFIG
# ============================================================

# Maximum number of different cameras that one global ID
# is allowed to contain from one junction.
#
# This protects against Re-ID accidentally chaining one
# appearance through almost every camera.
MAX_CAMERAS_PER_JUNCTION = 5

# Maximum number of observations from the SAME camera
# for one global vehicle.
MAX_OBSERVATIONS_PER_CAMERA = 1


# ============================================================
# HELPERS
# ============================================================

def junction_of(camera_id):

    return CAMERA_TO_JUNCTION.get(camera_id)


def vehicle_key(camera_id, vehicle_id):

    return (
        camera_id,
        int(vehicle_id)
    )


# ============================================================
# LOAD
# ============================================================

def load_json(path):

    if not path.exists():

        raise FileNotFoundError(
            f"File not found:\n{path}"
        )

    with open(
        path,
        "r",
        encoding="utf-8"
    ) as f:

        return json.load(f)


# ============================================================
# UNION FIND
# ============================================================

class UnionFind:

    def __init__(self):

        self.parent = {}
        self.rank = {}

    def add(self, x):

        if x not in self.parent:

            self.parent[x] = x
            self.rank[x] = 0

    def find(self, x):

        if self.parent[x] != x:

            self.parent[x] = self.find(
                self.parent[x]
            )

        return self.parent[x]

    def union(self, a, b):

        self.add(a)
        self.add(b)

        ra = self.find(a)
        rb = self.find(b)

        if ra == rb:
            return False

        if self.rank[ra] < self.rank[rb]:

            self.parent[ra] = rb

        elif self.rank[ra] > self.rank[rb]:

            self.parent[rb] = ra

        else:

            self.parent[rb] = ra
            self.rank[ra] += 1

        return True


# ============================================================
# BUILD RECORD LOOKUP
# ============================================================

def build_record_lookup(features):

    lookup = {}

    for item in features:

        camera_id = item.get(
            "camera_id"
        )

        vehicle_id = item.get(
            "vehicle_id"
        )

        if camera_id is None:
            continue

        if vehicle_id is None:
            continue

        key = vehicle_key(
            camera_id,
            vehicle_id
        )

        lookup[key] = item

    return lookup


# ============================================================
# CHECK WHETHER A MATCH CAN BE ACCEPTED
# ============================================================

def can_accept_match(
    match,
    group_members,
    record_lookup
):

    camera_a = match["camera_a"]
    vehicle_a = match["vehicle_a"]

    camera_b = match["camera_b"]
    vehicle_b = match["vehicle_b"]

    key_a = vehicle_key(
        camera_a,
        vehicle_a
    )

    key_b = vehicle_key(
        camera_b,
        vehicle_b
    )

    root_a = group_members.get(
        key_a
    )

    root_b = group_members.get(
        key_b
    )

    # If both already belong to same group,
    # nothing new is being created.
    if root_a is not None and root_a == root_b:

        return True, "already_connected"

    # --------------------------------------------------------
    # Collect members from both groups
    # --------------------------------------------------------

    members = []

    for key, root in group_members.items():

        if root == root_a or root == root_b:

            members.append(key)

    # Add new endpoints
    members.append(key_a)
    members.append(key_b)

    # --------------------------------------------------------
    # Cameras per junction
    # --------------------------------------------------------

    junction_cameras = defaultdict(set)

    for camera_id, vehicle_id in members:

        junction = junction_of(
            camera_id
        )

        if junction is None:
            continue

        junction_cameras[
            junction
        ].add(camera_id)

    # --------------------------------------------------------
    # Prevent huge same-junction chains
    # --------------------------------------------------------

    for junction, cameras in junction_cameras.items():

        if (
            len(cameras)
            > MAX_CAMERAS_PER_JUNCTION
        ):

            return (
                False,
                "too_many_cameras_same_junction"
            )

    return True, "accepted"


# ============================================================
# BUILD GROUPS
# ============================================================

def build_groups(
    features,
    matches
):

    record_lookup = build_record_lookup(
        features
    )

    uf = UnionFind()

    # Every detected vehicle starts as its
    # own global identity.
    for key in record_lookup:

        uf.add(key)

    # --------------------------------------------------------
    # Sort matches by confidence
    # --------------------------------------------------------

    matches_sorted = sorted(
        matches,
        key=lambda x: (
            float(
                x.get(
                    "similarity",
                    0
                )
            ),
            float(
                x.get(
                    "margin",
                    0
                )
            )
        ),
        reverse=True
    )

    accepted = []
    rejected = []

    for match in matches_sorted:

        key_a = vehicle_key(
            match["camera_a"],
            match["vehicle_a"]
        )

        key_b = vehicle_key(
            match["camera_b"],
            match["vehicle_b"]
        )

        # ----------------------------------------------------
        # Current roots
        # ----------------------------------------------------

        root_a = uf.find(key_a)
        root_b = uf.find(key_b)

        if root_a == root_b:

            accepted.append(match)

            continue

        # ----------------------------------------------------
        # Build temporary membership map
        # ----------------------------------------------------

        membership = {}

        for key in record_lookup:

            membership[key] = uf.find(key)

        # ----------------------------------------------------
        # Validate proposed connection
        # ----------------------------------------------------

        ok, reason = can_accept_match(
            match,
            membership,
            record_lookup
        )

        if not ok:

            rejected.append({
                **match,
                "rejection_reason": reason
            })

            continue

        # ----------------------------------------------------
        # Accept
        # ----------------------------------------------------

        uf.union(
            key_a,
            key_b
        )

        accepted.append(match)

    # --------------------------------------------------------
    # Final groups
    # --------------------------------------------------------

    groups = defaultdict(list)

    for key, item in record_lookup.items():

        root = uf.find(key)

        groups[root].append(item)

    return (
        groups,
        accepted,
        rejected
    )


# ============================================================
# BUILD PATHS
# ============================================================

def build_paths(groups):

    paths = []

    global_counter = 1

    for members in groups.values():

        # ----------------------------------------------------
        # Sort observations
        # ----------------------------------------------------

        ordered = sorted(
            members,
            key=lambda x: (
                str(
                    junction_of(
                        x.get("camera_id")
                    ) or ""
                ),
                str(
                    x.get("camera_id")
                    or ""
                ),
                x.get(
                    "first_frame"
                )
                if x.get(
                    "first_frame"
                ) is not None
                else 0
            )
        )

        global_id = (
            f"GLOBAL_VEHICLE_"
            f"{global_counter:05d}"
        )

        observations = []

        cameras = []
        junctions = []

        for item in ordered:

            camera_id = item.get(
                "camera_id"
            )

            junction = (
                item.get("junction")
                or item.get("scene")
                or junction_of(camera_id)
            )

            observation = {

                "junction":
                    junction,

                "camera_id":
                    camera_id,

                "camera_name":
                    item.get(
                        "camera_name"
                    ),

                "vehicle_id":
                    item.get(
                        "vehicle_id"
                    ),

                "vehicle_type":
                    item.get(
                        "vehicle_type"
                    ),

                "first_frame":
                    item.get(
                        "first_frame"
                    ),

                "last_frame":
                    item.get(
                        "last_frame"
                    ),

                "first_time_sec":
                    item.get(
                        "first_time_sec"
                    ),

                "last_time_sec":
                    item.get(
                        "last_time_sec"
                    ),

                "duration_sec":
                    item.get(
                        "duration_sec"
                    ),
            }

            observations.append(
                observation
            )

            if camera_id not in cameras:

                cameras.append(
                    camera_id
                )

            if junction not in junctions:

                junctions.append(
                    junction
                )

        paths.append({

            "global_vehicle_id":
                global_id,

            "num_observations":
                len(observations),

            "num_cameras":
                len(cameras),

            "num_junctions":
                len(junctions),

            "junctions":
                junctions,

            "cameras":
                cameras,

            "path":
                observations,

        })

        global_counter += 1

    return paths


# ============================================================
# MAIN
# ============================================================

def main():

    print()
    print(
        "=============================================="
    )
    print(
        "VALIDATED GLOBAL VEHICLE PATH BUILDER"
    )
    print(
        "=============================================="
    )

    # --------------------------------------------------------
    # Load features
    # --------------------------------------------------------

    print()
    print(
        "[1] Loading vehicle features..."
    )

    features = load_json(
        FEATURES_FILE
    )

    print(
        f"    Feature records: "
        f"{len(features)}"
    )

    # --------------------------------------------------------
    # Load matches
    # --------------------------------------------------------

    print()
    print(
        "[2] Loading cross-camera matches..."
    )

    match_data = load_json(
        MATCHES_FILE
    )

    matches = match_data.get(
        "matches",
        []
    )

    print(
        f"    Candidate matches: "
        f"{len(matches)}"
    )

    # --------------------------------------------------------
    # Build validated groups
    # --------------------------------------------------------

    print()
    print(
        "[3] Validating match chains..."
    )

    (
        groups,
        accepted,
        rejected
    ) = build_groups(
        features,
        matches
    )

    print(
        f"    Accepted connections: "
        f"{len(accepted)}"
    )

    print(
        f"    Rejected connections: "
        f"{len(rejected)}"
    )

    # --------------------------------------------------------
    # Build paths
    # --------------------------------------------------------

    print()
    print(
        "[4] Building global paths..."
    )

    paths = build_paths(
        groups
    )

    # --------------------------------------------------------
    # Save validated paths
    # --------------------------------------------------------

    output = {

        "configuration": {

            "max_cameras_per_junction":
                MAX_CAMERAS_PER_JUNCTION,

            "max_observations_per_camera":
                MAX_OBSERVATIONS_PER_CAMERA,
        },

        "total_global_vehicles":
            len(paths),

        "global_vehicles":
            paths,

    }

    with open(
        OUTPUT_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            output,
            f,
            indent=2
        )

    # --------------------------------------------------------
    # Flat records
    # --------------------------------------------------------

    flat_records = []

    for path in paths:

        for observation in path["path"]:

            flat_records.append({

                "global_vehicle_id":
                    path["global_vehicle_id"],

                **observation,

            })

    with open(
        RECORDS_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            flat_records,
            f,
            indent=2
        )

    # --------------------------------------------------------
    # Statistics
    # --------------------------------------------------------

    multi_camera = sum(
        x["num_cameras"] > 1
        for x in paths
    )

    multi_junction = sum(
        x["num_junctions"] > 1
        for x in paths
    )

    max_junctions = max(
        (
            x["num_junctions"]
            for x in paths
        ),
        default=0
    )

    max_cameras = max(
        (
            x["num_cameras"]
            for x in paths
        ),
        default=0
    )

    # --------------------------------------------------------
    # Print
    # --------------------------------------------------------

    print()
    print(
        "=============================================="
    )
    print(
        "VALIDATION COMPLETE"
    )
    print(
        "=============================================="
    )

    print(
        f"Input vehicles       : {len(features)}"
    )

    print(
        f"Candidate matches    : {len(matches)}"
    )

    print(
        f"Accepted connections : {len(accepted)}"
    )

    print(
        f"Rejected connections : {len(rejected)}"
    )

    print(
        f"Global vehicles      : {len(paths)}"
    )

    print(
        f"Multi-camera         : {multi_camera}"
    )

    print(
        f"Multi-junction       : {multi_junction}"
    )

    print(
        f"Max junctions/path   : {max_junctions}"
    )

    print(
        f"Max cameras/path     : {max_cameras}"
    )

    print()
    print(
        "Validated paths:"
    )

    print(
        OUTPUT_FILE
    )

    print()
    print(
        "Flat records:"
    )

    print(
        RECORDS_FILE
    )

    print(
        "=============================================="
    )


if __name__ == "__main__":
    main()