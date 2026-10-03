# Phase 3A Matching Diagnostic

## Scope

This report diagnoses the existing Phase 2 matcher before changing its algorithm. The diagnostic used the five current Re-ID caches, the existing matcher thresholds and LAP assignment logic, the configured temporal offsets, and the AICity S01 `gt.txt` annotations. No production matching threshold was changed for this analysis.

## Baseline

- Cameras: `camera_01` through `camera_05`
- Offsets: `0.000`, `1.640`, `2.049`, `2.177`, `2.235` seconds
- Local tracks: 107, 151, 161, 126, 154 respectively
- Total local tracks: 699
- Recorded global IDs: 696
- Recorded accepted cross-camera matches: 3
- Re-ID vector: 576-D CNN plus 96-D HSV color histogram
- Appearance score: `0.60 * CNN cosine + 0.40 * color cosine`
- Affinity gate: `0.76`
- Maximum temporal gap: `60` seconds
- Track duration exclusion: `85` seconds
- Ambiguity margin: `0.003`

The exact thresholds used are captured in `runs/cross_camera/phase3_matching_diagnostic.json`.

## Pair Statistics

The columns below are from the exact current matcher, except the symmetric timing and GT columns, which are diagnostic comparisons.

| Pair | Valid pairs | Current directional temporal | Symmetric temporal | Matcher candidates | Accepted | Rejected not-best | GT shared IDs | GT interval overlap | GT current directional |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| camera_01-camera_02 | 16,006 | 3,675 | 7,822 | 189 | 0 | 53 | 58 | 37 | 41 |
| camera_01-camera_03 | 17,066 | 4,340 | 8,909 | 228 | 0 | 61 | 75 | 51 | 42 |
| camera_01-camera_04 | 13,250 | 3,322 | 6,547 | 177 | 1 | 53 | 67 | 37 | 38 |
| camera_01-camera_05 | 16,324 | 4,212 | 8,392 | 0 | 0 | 0 | 76 | 48 | 36 |
| camera_02-camera_03 | 24,311 | 5,234 | 11,846 | 254 | 0 | 67 | 64 | 51 | 13 |
| camera_02-camera_04 | 18,875 | 4,022 | 8,749 | 165 | 1 | 50 | 69 | 68 | 41 |
| camera_02-camera_05 | 23,254 | 5,144 | 11,302 | 0 | 0 | 0 | 74 | 73 | 12 |
| camera_03-camera_04 | 20,125 | 4,696 | 9,957 | 349 | 1 | 83 | 72 | 55 | 33 |
| camera_03-camera_05 | 24,794 | 5,924 | 12,720 | 1 | 0 | 1 | 81 | 61 | 23 |
| camera_04-camera_05 | 19,250 | 4,272 | 9,424 | 2 | 0 | 2 | 80 | 80 | 22 |

The three accepted matches are:

- camera_01 track 224 to camera_04 track 216, similarity `0.7801`, confidence `0.8281`
- camera_02 track 281 to camera_04 track 234, similarity `0.8290`, confidence `0.8645`
- camera_03 track 1 to camera_04 track 1, similarity `0.8974`, confidence `0.9105`

## Appearance Distributions

Combined appearance similarity among pairs that passed symmetric timing and class compatibility:

| Pair | P05 | Median | P95 |
|---|---:|---:|---:|
| camera_01-camera_02 | 0.3617 | 0.6766 | 0.8464 |
| camera_01-camera_03 | 0.4848 | 0.7088 | 0.8504 |
| camera_01-camera_04 | 0.4698 | 0.7186 | 0.8551 |
| camera_01-camera_05 | 0.0000 | 0.5592 | 0.6896 |
| camera_02-camera_03 | 0.0000 | 0.6846 | 0.8463 |
| camera_02-camera_04 | 0.3391 | 0.6791 | 0.8427 |
| camera_02-camera_05 | 0.0000 | 0.5605 | 0.7005 |
| camera_03-camera_04 | 0.4612 | 0.7118 | 0.8574 |
| camera_03-camera_05 | 0.0000 | 0.5748 | 0.7133 |
| camera_04-camera_05 | 0.0000 | 0.5878 | 0.7269 |

The c005 pairs have substantially lower appearance scores. Their zero accepted matches are therefore not explained by timing alone.

## Findings

### 1. The current timing gate is directional

`_transition_gap_seconds(a, b)` computes `start_b - end_a`, with a two-second overlap allowance. That is appropriate for a known sequential camera transition, but the S01 annotations show substantial same-object interval overlap between cameras. For example, the ten pairs have 37 to 80 shared GT IDs with overlapping intervals. The current gate also rejects thousands of reverse-order pairs: approximately 4,931 to 10,209 per pair in this diagnostic.

This is an implementation/modeling issue, not evidence that all rejected pairs are valid matches. It means the current matcher is testing a sequential-transition hypothesis against a dataset that contains synchronized overlapping views.

### 2. The low count is not only a timing issue

Even after considering symmetric temporal feasibility, c005 appearance medians are approximately `0.56` to `0.59`, below the strict Tier 1/2/3 appearance requirements. c005 has a valid intrinsic matrix and `k1=-0.60` distortion calibration, but the Phase 2 Re-ID embeddings were extracted from raw crops and were not undistorted first. This can reduce cross-camera appearance comparability for c005.

The non-c005 pairs also have medians mostly between `0.68` and `0.72`, while the matcher requires high per-component scores and an affinity of at least `0.76`. This explains why many temporal candidates do not become accepted matches without lowering thresholds.

### 3. Track fragmentation is present but not quantified as the sole cause

The detector produces 107 to 161 stable tracks per camera, and the GT contains many shared object IDs. This is consistent with fragmented detections and/or different tracker identities across views, but the current output does not contain a detector-to-GT identity mapping. A later validation step must compare track intervals and spatial trajectories to GT rather than treating local tracker IDs as ground truth.

### 4. Camera IDs and offsets are internally consistent

The five caches, camera configuration, and generated global paths use `camera_01` through `camera_05`. The configured offsets match `S01.txt`. No evidence in this audit indicates an incorrect camera ID mapping or an offset parsing error.

### 5. Existing Phase 2 output has a cache-location reproducibility issue

The completed five-camera run wrote fresh caches in the repository root (`.c001_cache.json` through `.c005_cache.json`), while older c001/c002 caches remain under `runs/cross_camera`. The diagnostic explicitly used the fresh root caches. Future pipeline runs should make cache paths explicit and colocated with the other outputs so stale and current artifacts cannot be confused.

## Conclusion Before Algorithm Changes

The original three matches are reproducible and defensible under the existing strict matcher, but the matcher is not yet a valid synchronized multi-camera journey model. The primary evidence-backed correction is to separate two cases:

1. **Synchronized overlap matching:** compare interval overlap or symmetric temporal distance after applying recording offsets.
2. **Sequential transition matching:** use a directional exit-to-entry gap only when a verified camera ordering/transition model exists.

No threshold should be lowered solely to increase the match count. Phase 3 implementation should first add explicit timing mode, calibration-aware trajectory evidence, and c005 undistortion before evaluating any revised match count. Any revised matches must be validated against GT timing/spatial evidence and reported separately from the original baseline of three.
