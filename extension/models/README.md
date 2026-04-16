# T&C classifier model (frontend)

Classification runs **locally in the browser** using this JSON model, so every page view does **not** call your API.

## Generate the model file

From the **backend** project (`Distil-BE-API`), after training the classifier:

```bash
cd Distil-BE-API
python -m scripts.export_tc_classifier_json --out ../Distil-UI-EXTENSION/public/models/tc_page_classifier.json
```

Or export to the default path and copy:

```bash
python -m scripts.export_tc_classifier_json
# then copy models/tc_page_classifier_export.json to this folder as tc_page_classifier.json
```

If `tc_page_classifier.json` is missing, the extension falls back to the **API** for classification (one request per detection).
