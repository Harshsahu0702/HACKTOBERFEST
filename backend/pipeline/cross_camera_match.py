from pathlib import Path
import json
from collections import defaultdict

import numpy as np


# ============================================================
# PROJECT PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

REID_DIR = PROJECT_ROOT / "runs" / "reid"

FEATURES_FILE = REID_DIR / "vehicle_features.json"
MATCHES_FILE = REID_DIR / "cross_camera_matches.json"
GLOBAL_PATHS_FILE = REID_DIR / "global_vehicle_paths.json"
GLOBAL_RECORDS_FILE = REID_DIR / "global_vehicle_records.json"


# ============================================================
# MATCHING CONFIGURATION
# ============================================================

# Cameras belonging to the SAME junction.
SAME_JUNCTION_THRESHOLD = 0.72

# Cameras belonging to DIFFERENT junctions.
# Keep stricter to avoid false city-wide matches.
CROSS_JUNCTION_THRESHOLD = 0.80

# Best score must beat second-best candidate by this margin.
MIN_MARGIN = 0.04

# Only accept A -> B if B also considers A its best match.
MUTUAL_BEST_ONLY = True


# ============================================================
# HELPERS
# ============================================================

def get_junction(record):
    """
    IMPORTANT:
    vehicle_features.json uses 'junction',
    NOT 'scene'.
    """
    return record.get("junction")


def get_camera(record):
    return record.get("camera_id")


def get_vehicle(record):
    return record.get("vehicle_id")


def get_threshold(record_a, record_b):

    junction_a = get_junction(record_a)
    junction_b = get_junction(record_b)

    if (
        junction_a is not None
        and junction_b is not None
        and junction_a == junction_b
    ):
        return SAME_JUNCTION_THRESHOLD

    return CROSS_JUNCTION_THRESHOLD


# ============================================================
# LOAD FEATURES
# ============================================================

def load_features():

    if not FEATURES_FILE.exists():

        raise FileNotFoundError(
            f"Feature file not found:\n{FEATURES_FILE}"
        )

    with open(
        FEATURES_FILE,
        "r",
        encoding="utf-8"
    ) as f:

        return json.load(f)


# ============================================================
# PREPARE FEATURES
# ============================================================

def prepare_records(data):

    records = []

    for index, item in enumerate(data):

        feature = item.get("feature")

        if not feature:
            continue

        arr = np.asarray(
            feature,
            dtype=np.float32
        )

        norm = np.linalg.norm(arr)

        if norm <= 0:
            continue

        arr = arr / norm

        records.append({

            "_index": index,

            "global_vehicle_id":
                item.get("global_vehicle_id"),

            "junction":
                item.get("junction"),

            "camera_id":
                item.get("camera_id"),

            "camera_name":
                item.get("camera_name"),

            "vehicle_id":
                item.get("vehicle_id"),

            "vehicle_type":
                item.get("vehicle_type"),

            "first_frame":
                item.get("first_frame"),

            "last_frame":
                item.get("last_frame"),

            "first_time_sec":
                item.get("first_time_sec"),

            "last_time_sec":
                item.get("last_time_sec"),

            "duration_sec":
                item.get("duration_sec"),

            "trajectory_sample":
                item.get("trajectory_sample", []),

            "feature":
                arr,
        })

    return records


# ============================================================
# GROUP BY CAMERA
# ============================================================

def group_by_camera(records):

    groups = defaultdict(list)

    for record in records:

        camera = record.get("camera_id")

        if camera:

            groups[camera].append(record)

    return groups


# ============================================================
# COSINE SIMILARITY
# ============================================================

def similarity_matrix(source_records, target_records):

    if not source_records or not target_records:
        return None

    source_matrix = np.stack(
        [
            x["feature"]
            for x in source_records
        ]
    )

    target_matrix = np.stack(
        [
            x["feature"]
            for x in target_records
        ]
    )

    # Features are already normalized.
    # Therefore dot product = cosine similarity.
    return source_matrix @ target_matrix.T


# ============================================================
# BEST CANDIDATES
# ============================================================

def calculate_best_candidates(
    source_records,
    target_records,
):

    results = {}

    matrix = similarity_matrix(
        source_records,
        target_records
    )

    if matrix is None:
        return results

    for i, source in enumerate(source_records):

        similarities = matrix[i]

        if len(similarities) == 0:
            continue

        order = np.argsort(
            similarities
        )[::-1]

        best_index = int(order[0])

        best_score = float(
            similarities[best_index]
        )

        if len(order) > 1:

            second_score = float(
                similarities[order[1]]
            )

        else:

            second_score = -1.0

        margin = (
            best_score
            - second_score
        )

        results[
            source["_index"]
        ] = {

            "target_index":
                target_records[
                    best_index
                ]["_index"],

            "similarity":
                best_score,

            "second_similarity":
                second_score,

            "margin":
                margin,
        }

    return results


# ============================================================
# MATCH TWO CAMERAS
# ============================================================

def match_camera_pair(
    camera_a,
    records_a,
    camera_b,
    records_b
):

    if not records_a or not records_b:
        return []

    junction_a = records_a[0].get(
        "junction"
    )

    junction_b = records_b[0].get(
        "junction"
    )

    # Determine threshold from junction.
    if (
        junction_a is not None
        and junction_b is not None
        and junction_a == junction_b
    ):

        threshold = SAME_JUNCTION_THRESHOLD

    else:

        threshold = CROSS_JUNCTION_THRESHOLD

    print(
        f"    {camera_a} ({junction_a}) "
        f"<-> "
        f"{camera_b} ({junction_b}) "
        f"| threshold={threshold}"
    )

    # --------------------------------------------------------
    # A -> B
    # --------------------------------------------------------

    best_a_to_b = calculate_best_candidates(
        records_a,
        records_b
    )

    # --------------------------------------------------------
    # B -> A
    # --------------------------------------------------------

    best_b_to_a = calculate_best_candidates(
        records_b,
        records_a
    )

    # --------------------------------------------------------
    # Lookup target records
    # --------------------------------------------------------

    record_b_lookup = {
        x["_index"]: x
        for x in records_b
    }

    accepted = []

    # --------------------------------------------------------
    # Evaluate candidates
    # --------------------------------------------------------

    for record_a in records_a:

        index_a = record_a["_index"]

        candidate = best_a_to_b.get(
            index_a
        )

        if candidate is None:
            continue

        index_b = candidate[
            "target_index"
        ]

        similarity = candidate[
            "similarity"
        ]

        margin = candidate[
            "margin"
        ]

        # ----------------------------------------------------
        # Similarity threshold
        # ----------------------------------------------------

        if similarity < threshold:
            continue

        # ----------------------------------------------------
        # Ambiguity protection
        # ----------------------------------------------------

        if margin < MIN_MARGIN:
            continue

        # ----------------------------------------------------
        # Mutual nearest neighbour
        # ----------------------------------------------------

        if MUTUAL_BEST_ONLY:

            reverse = best_b_to_a.get(
                index_b
            )

            if reverse is None:
                continue

            if reverse[
                "target_index"
            ] != index_a:

                continue

        record_b = record_b_lookup.get(
            index_b
        )

        if record_b is None:
            continue

        # ----------------------------------------------------
        # Create match
        # ----------------------------------------------------

        accepted.append({

            "camera_a":
                camera_a,

            "junction_a":
                junction_a,

            "vehicle_a":
                record_a.get(
                    "vehicle_id"
                ),

            "camera_b":
                camera_b,

            "junction_b":
                junction_b,

            "vehicle_b":
                record_b.get(
                    "vehicle_id"
                ),

            "similarity":
                round(
                    similarity,
                    4
                ),

            "margin":
                round(
                    margin,
                    4
                ),

            "threshold":
                threshold,

            "first_frame_a":
                record_a.get(
                    "first_frame"
                ),

            "last_frame_a":
                record_a.get(
                    "last_frame"
                ),

            "first_frame_b":
                record_b.get(
                    "first_frame"
                ),

            "last_frame_b":
                record_b.get(
                    "last_frame"
                ),
        })

    return accepted


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

        if x not in self.parent:

            self.add(x)

        if self.parent[x] != x:

            self.parent[x] = self.find(
                self.parent[x]
            )

        return self.parent[x]

    def union(self, a, b):

        self.add(a)
        self.add(b)

        root_a = self.find(a)
        root_b = self.find(b)

        if root_a == root_b:
            return

        if (
            self.rank[root_a]
            < self.rank[root_b]
        ):

            self.parent[root_a] = root_b

        elif (
            self.rank[root_a]
            > self.rank[root_b]
        ):

            self.parent[root_b] = root_a

        else:

            self.parent[root_b] = root_a
            self.rank[root_a] += 1


# ============================================================
# BUILD GLOBAL GROUPS
# ============================================================

def build_global_groups(
    records,
    matches
):

    uf = UnionFind()

    record_lookup = {}

    # --------------------------------------------------------
    # Add every vehicle observation
    # --------------------------------------------------------

    for record in records:

        key = (
            record.get("camera_id"),
            record.get("vehicle_id")
        )

        record_lookup[key] = record

        uf.add(key)

    # --------------------------------------------------------
    # Connect matched vehicles
    # --------------------------------------------------------

    for match in matches:

        a = (
            match["camera_a"],
            match["vehicle_a"]
        )

        b = (
            match["camera_b"],
            match["vehicle_b"]
        )

        uf.union(a, b)

    # --------------------------------------------------------
    # Build groups
    # --------------------------------------------------------

    groups = defaultdict(list)

    for key, record in record_lookup.items():

        root = uf.find(key)

        groups[root].append(
            record
        )

    return groups


# ============================================================
# BUILD GLOBAL PATHS
# ============================================================

def build_global_paths(groups):

    paths = []

    global_counter = 1

    for _, group in groups.items():

        # ----------------------------------------------------
        # Sort chronologically as much as possible.
        #
        # Junction order is preserved separately.
        # ----------------------------------------------------

        group_sorted = sorted(
            group,
            key=lambda x: (
                str(
                    x.get("junction") or ""
                ),
                x.get("first_time_sec")
                if x.get("first_time_sec")
                is not None
                else 0,
                x.get("first_frame")
                if x.get("first_frame")
                is not None
                else 0,
            )
        )

        global_id = (
            f"GLOBAL_VEHICLE_"
            f"{global_counter:05d}"
        )

        observations = []

        cameras = []
        junctions = []

        # ----------------------------------------------------
        # Build observations
        # ----------------------------------------------------

        for item in group_sorted:

            junction = item.get(
                "junction"
            )

            camera_id = item.get(
                "camera_id"
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

            if (
                junction
                and junction not in junctions
            ):

                junctions.append(
                    junction
                )

        # ----------------------------------------------------
        # Sort junction list naturally:
        # S01, S03, S04, S05...
        # ----------------------------------------------------

        junctions.sort(
            key=lambda x: str(x)
        )

        # ----------------------------------------------------
        # Path
        # ----------------------------------------------------

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
        "================================================"
    )
    print(
        "CROSS-JUNCTION / CROSS-CAMERA VEHICLE MATCHING"
    )
    print(
        "================================================"
    )

    # ========================================================
    # 1. LOAD
    # ========================================================

    print()
    print(
        "[1] Loading Re-ID features..."
    )

    data = load_features()

    print(
        f"    Raw records: {len(data)}"
    )

    # ========================================================
    # 2. PREPARE
    # ========================================================

    records = prepare_records(
        data
    )

    print(
        f"    Valid records: {len(records)}"
    )

    # ========================================================
    # 3. VERIFY JUNCTION DATA
    # ========================================================

    junctions = sorted(
        set(
            x.get("junction")
            for x in records
            if x.get("junction")
        )
    )

    print()
    print(
        "[2] Junctions detected:"
    )

    for junction in junctions:

        camera_count = len(
            set(
                x.get("camera_id")
                for x in records
                if x.get("junction")
                == junction
            )
        )

        vehicle_count = sum(
            1
            for x in records
            if x.get("junction")
            == junction
        )

        print(
            f"    {junction}: "
            f"{camera_count} cameras | "
            f"{vehicle_count} features"
        )

    records_without_junction = sum(
        1
        for x in records
        if not x.get("junction")
    )

    if records_without_junction:

        print()
        print(
            "[WARNING]"
        )

        print(
            f"    Records without junction: "
            f"{records_without_junction}"
        )

    # ========================================================
    # 4. GROUP BY CAMERA
    # ========================================================

    camera_groups = group_by_camera(
        records
    )

    cameras = sorted(
        camera_groups.keys()
    )

    print()
    print(
        f"[3] Cameras with features: "
        f"{len(cameras)}"
    )

    for camera in cameras:

        camera_records = (
            camera_groups[camera]
        )

        camera_junctions = sorted(
            set(
                x.get("junction")
                for x in camera_records
            )
        )

        print(
            f"    {camera}: "
            f"junction={camera_junctions} | "
            f"features={len(camera_records)}"
        )

    # ========================================================
    # 5. PAIRWISE MATCHING
    # ========================================================

    print()
    print(
        "[4] Cross-camera matching..."
    )

    all_matches = []

    total_pairs = 0

    for i in range(
        len(cameras)
    ):

        for j in range(
            i + 1,
            len(cameras)
        ):

            camera_a = cameras[i]
            camera_b = cameras[j]

            records_a = camera_groups[
                camera_a
            ]

            records_b = camera_groups[
                camera_b
            ]

            matches = match_camera_pair(
                camera_a,
                records_a,
                camera_b,
                records_b
            )

            total_pairs += 1

            if matches:

                print(
                    f"        Accepted: "
                    f"{len(matches)}"
                )

                all_matches.extend(
                    matches
                )

    # ========================================================
    # 6. SORT MATCHES
    # ========================================================

    all_matches.sort(
        key=lambda x:
            x["similarity"],
        reverse=True
    )

    # ========================================================
    # 7. GLOBAL VEHICLES
    # ========================================================

    print()
    print(
        "[5] Building Global Vehicle IDs..."
    )

    groups = build_global_groups(
        records,
        all_matches
    )

    global_paths = build_global_paths(
        groups
    )

    # ========================================================
    # 8. SAVE MATCHES
    # ========================================================

    REID_DIR.mkdir(
        parents=True,
        exist_ok=True
    )

    with open(
        MATCHES_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            {
                "configuration": {

                    "same_junction_threshold":
                        SAME_JUNCTION_THRESHOLD,

                    "cross_junction_threshold":
                        CROSS_JUNCTION_THRESHOLD,

                    "min_margin":
                        MIN_MARGIN,

                    "mutual_best_only":
                        MUTUAL_BEST_ONLY,
                },

                "total_records":
                    len(records),

                "total_camera_pairs":
                    total_pairs,

                "total_matches":
                    len(all_matches),

                "matches":
                    all_matches,
            },
            f,
            indent=2
        )

    # ========================================================
    # 9. SAVE GLOBAL PATHS
    # ========================================================

    with open(
        GLOBAL_PATHS_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            {
                "total_global_vehicles":
                    len(global_paths),

                "global_vehicles":
                    global_paths,
            },
            f,
            indent=2
        )

    # ========================================================
    # 10. SAVE FLAT GLOBAL RECORDS
    # ========================================================

    flat_records = []

    for path in global_paths:

        global_id = path[
            "global_vehicle_id"
        ]

        for observation in path[
            "path"
        ]:

            flat_records.append({

                "global_vehicle_id":
                    global_id,

                **observation,

            })

    with open(
        GLOBAL_RECORDS_FILE,
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            flat_records,
            f,
            indent=2
        )

    # ========================================================
    # 11. STATISTICS
    # ========================================================

    multi_camera = sum(
        1
        for x in global_paths
        if x["num_cameras"] > 1
    )

    multi_junction = sum(
        1
        for x in global_paths
        if x["num_junctions"] > 1
    )

    # Junction transition examples
    cross_junction_matches = sum(
        1
        for x in all_matches
        if x["junction_a"]
        != x["junction_b"]
    )

    same_junction_matches = sum(
        1
        for x in all_matches
        if x["junction_a"]
        == x["junction_b"]
    )

    # ========================================================
    # 12. FINAL OUTPUT
    # ========================================================

    print()
    print(
        "================================================"
    )
    print(
        "CROSS-JUNCTION MATCHING COMPLETE"
    )
    print(
        "================================================"
    )

    print(
        f"Feature records          : {len(records)}"
    )

    print(
        f"Junctions                : {len(junctions)}"
    )

    print(
        f"Cameras                  : {len(cameras)}"
    )

    print(
        f"Camera pairs checked     : {total_pairs}"
    )

    print(
        f"Same-junction matches    : "
        f"{same_junction_matches}"
    )

    print(
        f"Cross-junction matches   : "
        f"{cross_junction_matches}"
    )

    print(
        f"Total accepted matches   : "
        f"{len(all_matches)}"
    )

    print(
        f"Global vehicles          : "
        f"{len(global_paths)}"
    )

    print(
        f"Multi-camera vehicles    : "
        f"{multi_camera}"
    )

    print(
        f"Multi-junction paths     : "
        f"{multi_junction}"
    )

    print()
    print(
        "Outputs:"
    )

    print(
        f"Matches  : {MATCHES_FILE}"
    )

    print(
        f"Paths    : {GLOBAL_PATHS_FILE}"
    )

    print(
        f"Records  : {GLOBAL_RECORDS_FILE}"
    )

    print(
        "================================================"
    )


if __name__ == "__main__":
    main()