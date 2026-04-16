# T&C Page Binary Classifier

Binary classifier to detect whether a webpage is a **Terms & Conditions (T&C)** page using **TF-IDF + Logistic Regression**.

## Dataset sources

- **Positive class (T&C)**  
  - [CodeHima/TOS_DatasetV3](https://huggingface.co/datasets/CodeHima/TOS_DatasetV3) (~10k sentences)  
  - [CodeHima/TOS_Dataset](https://huggingface.co/datasets/CodeHima/TOS_Dataset) (~6.8k sentences)  
  - [ToS;DR policies dataset (clean)](https://zenodo.org/records/15013541) — Zenodo CSV `point_quote_text` (downloaded automatically).  
  - [Annotated ToS of 100 Online Platforms](https://data.mendeley.com/datasets/dtbj87j937/3) — Mendeley “Clear ToS” folder: full ToS documents (use local path; see below).  
  Sentences/snippets are aggregated into page-like documents (10–50 per doc); Mendeley files are used as full documents.

- **Negative class (not T&C)**  
  - [Wikitext-2-raw](https://huggingface.co/datasets/wikitext) — general text chunks of similar length.

**Using Mendeley:** Download the dataset from [Mendeley Data](https://data.mendeley.com/datasets/dtbj87j937/3), extract it, and either set `MENDELEY_CLEAR_TOS_PATH` to the “Clear ToS” folder or pass `--mendeley-path path/to/Clear ToS` when training.

## Pipeline

- **TfidfVectorizer**: `ngram_range=(1, 2)`, `max_features=50_000`, `min_df=2`, `max_df=0.95`
- **LogisticRegression**: L2 regularization, `class_weight='balanced'`
- Persisted as a single sklearn Pipeline (joblib).

## Train

From project root:

```bash
uv sync   # or pip install -e .
python -m scripts.train_tc_classifier
```

Options:

- `--max-positive 5000` — max T&C documents
- `--max-negative 5000` — max negative documents  
- `--test-size 0.2` — fraction held out for evaluation
- `--out models/tc_page_classifier.joblib` — output path  
- `--no-zenodo` — skip Zenodo ToS;DR download  
- `--mendeley-path PATH` — path to Mendeley “Clear ToS” folder (or set `MENDELEY_CLEAR_TOS_PATH`)

Example for a smaller run:

```bash
python -m scripts.train_tc_classifier --max-positive 2000 --max-negative 2000 --out models/tc_classifier.joblib
```

First run will download Hugging Face datasets (ToS + Wikitext).

## Use in code

```python
from ml.pipeline import load_pipeline, predict_tc_page, predict_proba_tc_page

pipeline = load_pipeline("models/tc_page_classifier.joblib")
is_tc = predict_tc_page(pipeline, page_text)
prob = predict_proba_tc_page(pipeline, page_text)
```

Or via the service (uses `TC_CLASSIFIER_MODEL_PATH` or default `models/tc_page_classifier.joblib`):

```python
from services import tc_page_classifier

is_tc = tc_page_classifier.is_tc_page(page_text)
prob = tc_page_classifier.tc_page_probability(page_text)
```

## API

After training, the API exposes:

- **POST /api/classify-page** (JWT required)  
  Body: `{ "text": "page content..." }`  
  Response: `{ "is_tc_page": true/false, "probability": 0.92 }`

If the model file is missing, the endpoint returns 503.

## Target dataset size

| Total documents | Expected performance |
|-----------------|----------------------|
| 1,000           | Baseline             |
| 3,000–6,000     | Very strong          |
| 8,000–15,000    | Production-ready     |

## Notes

- Clean HTML before classification (remove nav, footer, scripts).
- For robustness, consider including other legal pages (privacy policy, refund policy) in the positive set and re-labelling or adding a separate label in a future version.
