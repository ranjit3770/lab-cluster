import os
import sys

# Make `app` (the job-api package) importable when pytest runs from anywhere.
JOB_API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if JOB_API_ROOT not in sys.path:
    sys.path.insert(0, JOB_API_ROOT)
