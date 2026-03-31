Your current system supports:

- ✅ Python scripts
- ✅ Jupyter Lab

👉 That’s a good start, but HPC portals usually support **many more workload types**.

Let’s expand this in a **practical, production-safe way** 👇

---

# 🔷 1. Core Principle (IMPORTANT)

👉 You should **NOT change scheduling logic**
👉 You should **expand execution capabilities**

Think:

```text
Portal = "how to run things"
SLURM = "where/when to run"
```

---

# 🔷 2. High-Value Additions (Recommended)

## 🟢 1. Shell / Bash Jobs

![Image](https://www.cyberciti.biz/media/new/faq/2017/12/Give-execute-permission-to-your-script-on-Linux.png)

![Image](https://hpc.nmsu.edu/onboarding/supercomputing/_images/slurm-commands-example.png)

![Image](https://genomicsaotearoa.github.io/Workshop-Bash_Scripting_And_HPC_Job_Scheduler/nesi_images/anatomy_of_a_slurm_script.png)

![Image](https://www.uhd.edu/images/computing/hpc/slurm/sbatch.png)

### ✅ Why

- Most HPC users already use `.sh` scripts
- Needed for pipelines, automation

### Example

```bash
#!/bin/bash
#SBATCH --ntasks=2
#SBATCH --mem=4G

echo "Running job"
./run_pipeline.sh
```

👉 Just allow:

- `.sh` entry points
- Execute directly instead of python

---

## 🟢 2. Multi-language Support

![Image](https://www.cyberciti.biz/media/new/faq/2014/04/gcc-verification.jpg)

![Image](https://itsfoss.com/content/images/wordpress/2021/09/running-java-programs-in-Linux-terminal.png)

![Image](https://i.sstatic.net/la7EX.png)

![Image](https://docs.posit.co/ide/user/ide/guide/code/images/quarto-execute-line.png)

### Support:

| Language | Execution                      |
| -------- | ------------------------------ |
| C/C++    | `gcc main.c && ./a.out`        |
| Java     | `javac Main.java && java Main` |
| R        | `Rscript script.R`             |
| MATLAB   | `matlab -batch script`         |

👉 Detect by extension:

- `.c`, `.cpp`, `.java`, `.R`, `.m`

---

## 🟢 3. Docker / Container Jobs (VERY POWERFUL)

![Image](https://media2.dev.to/dynamic/image/width%3D1000%2Cheight%3D420%2Cfit%3Dcover%2Cgravity%3Dauto%2Cformat%3Dauto/https%3A%2F%2Fdev-to-uploads.s3.amazonaws.com%2Fuploads%2Farticles%2Fvxanfmgvx7t0a5hi0xsz.png)

![Image](https://ulhpc-tutorials.readthedocs.io/en/latest/containers/singularity/images/sing.png)

![Image](https://superorbital.io/blog/slurm-an-hpc-scheduler-for-batch-workloads/slurm-layout.gif)

![Image](https://slurm.schedmd.com/arch.gif)

### ✅ Why

- Avoid dependency issues
- Reproducible environments

### HPC standard:

- Use **Singularity / Apptainer**

### Example

```bash
singularity exec my_image.sif python train.py
```

---

## 🟢 4. GPU Jobs (High Demand)

![Image](https://m.media-amazon.com/images/I/71MrVQbDSqL._UF1000%2C1000_QL80_.jpg)

![Image](https://bizon-tech.com/media/catalog/product/cache/1/image/9df78eab33525d08d6e5fb8d27136e95/_/b/_banner-g7000-mobile_1_1.jpg)

![Image](https://www.hpc.iastate.edu/sites/default/files/uploads/HPCHowTo/HPCCluster.JPG)

![Image](https://cdn.prod.website-files.com/675823350267b290d7ca1c88/675823350267b290d7ca1f3b_hpc_cluster.png)

### Add support:

```bash
#SBATCH --gres=gpu:1
```

👉 Portal input:

```json
"gpu": 1
```

---

## 🟢 5. MPI / Parallel Jobs

![Image](https://raw.githubusercontent.com/AaltoSciComp/aaltoscicomp-graphics/master/figures/cluster-schematic/cluster-schematic-mpi.png)

![Image](https://optics.ansys.com/hc/article_attachments/360059611974)

![Image](https://ekatsevi.github.io/statistical-computing/figures/hpc-schematic.jpg)

![Image](https://media.licdn.com/dms/image/v2/D5612AQGpyqo0EQgntg/article-cover_image-shrink_720_1280/article-cover_image-shrink_720_1280/0/1679687655296?e=2147483647&t=k-jR2CwFlQTrUG5txQx5oB8Hgut8ua_FyOwbZkSbHhQ&v=beta)

### Example

```bash
#SBATCH --ntasks=8

srun ./mpi_program
```

👉 Needed for:

- simulations
- scientific workloads

---

## 🟢 6. Workflow / Pipeline Jobs

### Tools:

- Airflow (light integration)
- Prefect
- simple DAG runner

---

### Example:

```text
Step1 → preprocess
Step2 → train
Step3 → evaluate
```

---

## 🟢 7. Interactive Terminal Jobs

Instead of only Jupyter:

```bash
srun --pty bash
```

👉 Useful for:

- debugging
- manual runs

---

## 🟢 8. Data Management Tools

- Upload datasets
- Mount shared storage
- Dataset versioning

---

## 🟢 9. Job Templates (VERY USEFUL)

Predefined templates:

- ML training
- Data processing
- Simulation

---

## 🟢 10. Environment Management

Instead of only venv:

- Conda support
- Module system (`module load cuda`)

---

# 🔷 3. What You Should Add FIRST (Priority)

## 🥇 Phase 1 (Easy + High Impact)

- ✅ Bash scripts
- ✅ Multi-language support
- ✅ Job templates

---

## 🥈 Phase 2

- ✅ GPU support
- ✅ MPI jobs

---

## 🥉 Phase 3 (Advanced)

- ✅ Containers (Singularity)
- ✅ Workflow pipelines

---

# 🔷 4. Minimal Changes Needed in Your System

You don’t need major changes.

👉 Just update:

### In `slurm.py`

Replace:

```python
"$VENV/bin/python" "{entry_script}"
```

👉 With:

```python
detect file type → run accordingly
```

---

# 🔷 5. Example Execution Mapping

| File Type | Command      |
| --------- | ------------ |
| `.py`     | python       |
| `.sh`     | bash         |
| `.R`      | Rscript      |
| `.cpp`    | g++ + run    |
| `.java`   | javac + java |

---

# 🔥 Final Recommendation

👉 Don’t touch scheduler
👉 Expand execution layer

---

# 🔚 One-line Summary

👉
**Add more “what to run” (tools & languages), not “how to schedule”**

---
