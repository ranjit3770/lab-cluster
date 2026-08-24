# Product Expansion Roadmap

Current supported workload entry points:

- Python scripts
- Jupyter Lab

This document lists practical, production-safe additions, prioritized. The
guiding rule for every item:

> Do not change scheduling logic. Expand execution capabilities.

```text
Portal = "how to run things"
Slurm  = "where/when to run"
```

## Planned Workload Types

### Phase 1 — Easy And High Impact

#### 1. Shell / Bash jobs

Most HPC users already use `.sh` scripts; needed for pipelines and automation.

```bash
#!/bin/bash
#SBATCH --ntasks=2
#SBATCH --mem=4G

echo "Running job"
./run_pipeline.sh
```

Portal change: accept `.sh` entry points and execute them directly instead of
assuming Python.

#### 2. Multi-language support

| Language | Execution |
| --- | --- |
| C/C++ | `gcc main.c && ./a.out` |
| Java | `javac Main.java && java Main` |
| R | `Rscript script.R` |
| MATLAB | `matlab -batch script` |

Detect the language by extension: `.c`, `.cpp`, `.java`, `.R`, `.m`.

#### 3. Job templates

Predefined submission templates for common workloads: ML training, data
processing, simulation.

### Phase 2

#### 4. GPU jobs

Expose GRES requests in the portal input:

```json
"gpu": 1
```

which maps to:

```bash
#SBATCH --gres=gpu:1
```

The planner already parses node GRES from live Slurm state.

#### 5. MPI / parallel jobs

```bash
#SBATCH --ntasks=8

srun ./mpi_program
```

Required for simulations and scientific workloads; the horizontal allocation
mode already generates multi-task scripts with `srun`.

### Phase 3 — Advanced

#### 6. Container jobs (Singularity/Apptainer)

Reproducible environments without dependency conflicts — the HPC standard:

```bash
singularity exec my_image.sif python train.py
```

#### 7. Workflow / pipeline jobs

Chained steps such as preprocess → train → evaluate, via Airflow (light
integration), Prefect, or a simple DAG runner.

#### 8. Interactive terminal jobs

Beyond Jupyter:

```bash
srun --pty bash
```

Useful for debugging and manual runs.

### Backlog

#### 9. Data management tools

Dataset upload, shared-storage mounting helpers, dataset versioning.

#### 10. Environment management

Conda support in addition to venv, and environment modules
(`module load cuda`).

## Implementation Notes

Minimal changes are required in the existing service. In
`backend/job-api/app/slurm.py`, replace the fixed Python invocation:

```python
"$VENV/bin/python" "{entry_script}"
```

with file-type detection that selects the runner:

| File type | Command |
| --- | --- |
| `.py` | python |
| `.sh` | bash |
| `.R` | Rscript |
| `.cpp` | g++ + run |
| `.java` | javac + java |

## Summary

Add more "what to run" (tools and languages), not "how to schedule".
