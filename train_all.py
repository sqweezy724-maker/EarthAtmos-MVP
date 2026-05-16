# train_all.py
import subprocess
import sys

scripts = [
    "ml/train.py",
    "ml/train_weather_type.py", 
    "ml/train_anomaly_model.py",
]

for script in scripts:
    print(f"\n{'='*50}")
    print(f"Running {script}...")
    print('='*50)
    result = subprocess.run([sys.executable, script], check=True)

print("\nAll models trained successfully!")
