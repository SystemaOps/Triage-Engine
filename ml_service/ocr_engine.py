import re
import os
import easyocr

class MedicalOCREngine:
    def __init__(self):
        # Initialize easyocr reader for English.
        # This will download the model weights automatically on first run.
        print("Initializing EasyOCR Reader...")
        self.reader = easyocr.Reader(['en'], gpu=False) # set gpu=True if GPU is available
        
    def extract_text(self, image_path):
        """Runs OCR on the image and returns a list of text strings."""
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found at: {image_path}")
            
        print(f"Scanning image: {image_path}...")
        results = self.reader.readtext(image_path)
        
        # Results is a list of tuples: (bounding_box, text, confidence)
        extracted_lines = [res[1] for res in results]
        return extracted_lines
        
    def parse_metrics(self, text_lines):
        """Parses extracted lines for Glucose, WBC, and Hemoglobin values."""
        parsed_data = {
            "blood_glucose": None,
            "white_blood_cells": None,
            "hemoglobin": None
        }
        
        # Combine all lines into a single text block for regex scanning
        full_text = "\n".join(text_lines)
        print("--- Extracted Raw Text ---")
        print(full_text)
        print("---------------------------")
        
        # Regex pattern matching for real-world report variations
        # 1. Glucose: handles Fasting Glucose, Blood Sugar, FBS, Glu, B-Glucose
        glucose_match = re.search(
            r'(?:fasting\s+glucose|blood\s+sugar|fbs|glucose|glu|sugar|b-glucose)\D*(\d+(?:\.\d+)?)', 
            full_text, 
            re.IGNORECASE
        )
        if glucose_match:
            parsed_data["blood_glucose"] = float(glucose_match.group(1))
            
        # 2. WBC: handles WBC, White Blood Cells, Leukocytes, Total Leukocyte Count, TLC
        wbc_match = re.search(
            r'(?:wbc|white\s+blood|white\s+cell|leukocyte|total\s+leukocyte|tlc)\D*(\d+(?:\.\d+)?)', 
            full_text, 
            re.IGNORECASE
        )
        if wbc_match:
            parsed_data["white_blood_cells"] = float(wbc_match.group(1))
            
        # 3. Hemoglobin: handles Hemoglobin, Haemoglobin, Hgb, Hb
        hemoglobin_match = re.search(
            r'(?:hemoglobin|haemoglobin|hgb|hb)\D*(\d+(?:\.\d+)?)', 
            full_text, 
            re.IGNORECASE
        )
        if hemoglobin_match:
            parsed_data["hemoglobin"] = float(hemoglobin_match.group(1))
            
        return parsed_data

if __name__ == '__main__':
    # Test execution
    # Ensure mock assets exist
    if not os.path.exists('assets/mock_blood_report.png'):
        print("Generating mock data first...")
        from create_mock_data import generate_mock_blood_report
        generate_mock_blood_report()
        
    engine = MedicalOCREngine()
    raw_text = engine.extract_text('assets/mock_blood_report.png')
    metrics = engine.parse_metrics(raw_text)
    
    print("\n--- Parsed Metrics ---")
    print(metrics)
    print("----------------------")
