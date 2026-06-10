import os
import urllib.request
import csv
import io
from xray_engine import MedicalXrayEngine

def download_real_images():
    os.makedirs('assets/real_samples', exist_ok=True)
    
    # 1. Wikimedia Commons raw URL (Normal X-ray)
    normal_url = "https://upload.wikimedia.org/wikipedia/commons/a/a1/Normal_posteroanterior_%28PA%29_chest_radiograph_%28X-ray%29.jpg"
    print("Downloading real normal chest X-ray image...")
    try:
        req = urllib.request.Request(
            normal_url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        with urllib.request.urlopen(req) as response, open('assets/real_samples/normal_xray.jpg', 'wb') as out_file:
            out_file.write(response.read())
        print("Successfully saved assets/real_samples/normal_xray.jpg")
    except Exception as e:
        print(f"Error downloading normal X-ray: {e}")
        
    # 2. Dynamic GitHub Download (Pneumonia X-ray)
    print("Downloading real pneumonia chest X-ray image dynamically from IEEE database...")
    try:
        # Read the metadata.csv from the ieee8023/covid-chestxray-dataset to find a valid file name
        metadata_url = "https://raw.githubusercontent.com/ieee8023/covid-chestxray-dataset/master/metadata.csv"
        req = urllib.request.Request(
            metadata_url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        with urllib.request.urlopen(req) as response:
            csv_data = response.read().decode('utf-8')
            
        reader = csv.DictReader(io.StringIO(csv_data))
        pneumonia_filename = None
        for row in reader:
            finding = row.get('finding', '')
            filename = row.get('filename', '')
            # Find the first image associated with Pneumonia
            if ('pneumonia' in finding.lower() or 'covid' in finding.lower()) and filename:
                pneumonia_filename = filename
                print(f"Dynamically selected image '{filename}' (Finding: {finding})")
                break
                
        if pneumonia_filename:
            image_url = f"https://raw.githubusercontent.com/ieee8023/covid-chestxray-dataset/master/images/{pneumonia_filename}"
            req = urllib.request.Request(
                image_url, 
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            )
            # Save it with its original file extension
            ext = os.path.splitext(pneumonia_filename)[1]
            out_path = f'assets/real_samples/pneumonia_xray{ext}'
            with urllib.request.urlopen(req) as response, open(out_path, 'wb') as out_file:
                out_file.write(response.read())
            print(f"Successfully saved assets/real_samples/pneumonia_xray{ext}")
            return out_path
        else:
            print("No pneumonia image found in metadata.")
    except Exception as e:
        print(f"Error downloading pneumonia X-ray dynamically: {e}")
    return None

def run_real_predictions(pneumonia_path):
    # Load model engine
    engine = MedicalXrayEngine()
    
    print("\n=== RUNNING CLASSIFIER ON REAL DATA ===")
    
    # 1. Test Normal
    normal_path = 'assets/real_samples/normal_xray.jpg'
    if os.path.exists(normal_path):
        res_normal = engine.classify_xray(normal_path)
        print(f"FILE: {normal_path} -> PREDICTED: {res_normal['pathology']} (Confidence: {res_normal['confidence']})")
    
    # 2. Test Pneumonia
    if pneumonia_path and os.path.exists(pneumonia_path):
        res_pneumonia = engine.classify_xray(pneumonia_path)
        print(f"FILE: {pneumonia_path} -> PREDICTED: {res_pneumonia['pathology']} (Confidence: {res_pneumonia['confidence']})")

if __name__ == '__main__':
    pneumonia_file = download_real_images()
    run_real_predictions(pneumonia_file)
