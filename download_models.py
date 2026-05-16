
from huggingface_hub import HfApi
from pathlib import Path

TOKEN = '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'
HF_USERNAME = 'Amirkhan234'
REPO_ID = f'Amirkhan234/earthatmos-models'

api = HfApi(token=TOKEN)

files = [
    'models/weather_7day_models.pkl',
    'models/weather_feature_columns.pkl',
    'models/weather_type.pkl',
    'models/weather_label_encoder.pkl',
    'models/anomaly_model.pkl',
    'models/anomaly_scaler.pkl',
    'models/anomaly_thresholds.json',
]

for f in files:
    path = Path(f)
    if not path.exists():
        print(f'SKIP {f} - не найден')
        continue
    print(f'Uploading {path.name}...')
    api.upload_file(
        path_or_fileobj=str(path),
        path_in_repo=path.name,
        repo_id=REPO_ID,
        repo_type='model',
        token=TOKEN,
    )
    print(f'OK {path.name}')

print('Готово! Модели на HuggingFace.')

