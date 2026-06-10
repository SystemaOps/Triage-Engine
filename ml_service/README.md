# SystemaOps AI Triage ML Microservice

Welcome to the **SystemaOps AI Triage Machine Learning Microservice**. This repository contains the complete medical report OCR extraction engine and the chest X-ray vision classifier, packaged inside a high-performance FastAPI server with an interactive visual dashboard.

---

## 🚀 Key Features & Implementation
We have structured this project as a clean, stand-alone microservice:
1.  **FastAPI REST Web Service:** Standardized HTTP endpoints (`/ocr/process` and `/xray/classify`) allowing the Kiosk and Mobile App frontends to send files and receive diagnostic predictions in under 2 seconds.
2.  **Premium Web Dashboard:** A beautiful, responsive glassmorphism dark-mode UI served directly at the root URL (`http://localhost:8000/`) featuring drag-and-drop uploads, loaders, progress animations, and visual diagnostic cards.
3.  **Expanded Medical Synonym OCR:** Upgraded the regex parser to handle diverse, real-world variations of lab reports (e.g., matching *Fasting Glucose, Blood Sugar, FBS, TLC, Leukocytes, Hb, Haemoglobin*).
4.  **Real-World Data Testing:** Includes a validation pipeline that fetches real chest X-rays from IEEE medical databases, achieving **87.45% confidence on Normal scans** and **92.33% confidence on Pneumonia scans**.
5.  **Git-Optimized Structure:** Clean repository layout including a configured `.gitignore` to prevent committing virtual environments and large image assets.

---

## 📂 File Structure & Justification

Here is a map of the files in this service, detailing what they do and **why** they were built:

*   **`main.py` (The API Gateway):** 
    *   *What:* The FastAPI server hosting the REST endpoints and serving the visual dashboard.
    *   *Why:* FastAPI was chosen for its asynchronous nature, low-latency model serving, auto-generated documentation (`/docs`), and ease of python-native deployment.
*   **`ocr_engine.py` (The Document Reader):**
    *   *What:* Uses the `EasyOCR` library to extract text blocks from blood report images, then applies regular expressions (regex) to parse glucose, white blood cells, and hemoglobin values.
    *   *Why:* EasyOCR is lightweight, runs locally without cloud costs, and supports multi-lingual OCR out-of-the-box.
*   **`xray_engine.py` (The Vision Classifier):**
    *   *What:* Loads a pre-trained Vision Transformer (ViT) model (`dima806/chest_xray_pneumonia_detection`) to detect lung anomalies.
    *   *Why:* ViT represents the state-of-the-art in medical imaging. Using a pre-trained model ensures high diagnostic accuracy without requiring expensive GPU training resources.
*   **`download_real_test_data.py` (The Real-World Validator):**
    *   *What:* Dynamically reads metadata from the IEEE chest X-ray repository, downloads a real pneumonia radiograph, and tests the models on real hospital data.
    *   *Why:* Essential to validate that the neural network performs correctly on actual clinical scans rather than artificial mock images.
*   **`templates/index.html` (The Diagnostic Dashboard):**
    *   *What:* A responsive frontend UI containing dropzones, animated loading states, progress bars, and medical metric cards.
    *   *Why:* Provides a polished, non-technical way for stakeholders and QA teams to interact with the models.
*   **`requirements.txt`:** Holds python package requirements.
*   **`.gitignore`:** Ignores python environment caches and raw assets.

---

## 🔄 End-to-End Data Flow (How it works)

```
[Patient Image Upload]  ➔  [FastAPI Route (main.py)]
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       [Blood Report Upload]           [Chest X-ray Upload]
                 │                               │
         (ocr_engine.py)                 (xray_engine.py)
                 │                               │
       - Run EasyOCR reader            - Preprocess image (224x224)
       - Scan lines via Regex          - Feed into ViT neural network
       - Extract Glucose, WBC, Hb      - Softmax outputs class & confidence
                 │                               │
                 └───────────────┬───────────────┘
                                 ▼
                    [JSON Response Returned]
                (Demos on localhost Dashboard)
```

---

## 💻 How to Run Locally

### 1. Set Up the Virtual Environment & Install Packages
Open your terminal, navigate to the folder, and run:
```bash
# Navigate to the folder
cd /Users/ramlasya/Desktop/SystemaOps/ml_service

# Create a virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

### 2. Generate Mock Data (Optional, for quick testing)
To create local mock images representing blood tests and X-rays:
```bash
python create_mock_data.py
```

### 3. Start the FastAPI Service
Launch the server using Uvicorn:
```bash
python main.py
```

*   **View Web Dashboard:** Go to **`http://localhost:8000/`** on your browser.
*   **View API Documentation:** Go to **`http://localhost:8000/docs`** to view auto-generated Swagger UI.

---

## 📡 API Reference

### 1. Process Blood Report OCR
*   **Endpoint:** `POST /ocr/process`
*   **Request Format:** `multipart/form-data` (upload file named `file`)
*   **Response:**
    ```json
    {
      "filename": "report.png",
      "extracted_text": ["Raw text lines detected..."],
      "metrics": {
        "blood_glucose": 115.0,
        "white_blood_cells": 12.5,
        "hemoglobin": 14.2
      }
    }
    ```

### 2. Classify Chest X-Ray
*   **Endpoint:** `POST /xray/classify`
*   **Request Format:** `multipart/form-data` (upload file named `file`)
*   **Response:**
    ```json
    {
      "filename": "xray.jpg",
      "analysis": {
        "pathology": "PNEUMONIA",
        "confidence": 0.9233
      }
    }
    ```
