import os
from PIL import Image, ImageDraw, ImageFont

def generate_mock_blood_report():
    # Create a white canvas (800x600) representing a printed report
    img = Image.new('RGB', (800, 600), color='white')
    draw = ImageDraw.Draw(img)
    
    # Write some standard blood report test lines
    lines = [
        "METABOLIC PANEL & BLOOD COUNT REPORT",
        "Patient Name: John Doe   Age: 45   Date: 2026-06-01",
        "--------------------------------------------------",
        "TEST NAME            RESULT      REFERENCE INTERVAL",
        "--------------------------------------------------",
        "Fasting Blood Glucose: 115 mg/dL   (70 - 99)",
        "White Blood Cell (WBC): 12.5 K/uL  (4.5 - 11.0)",
        "Hemoglobin: 14.2 g/dL             (13.8 - 17.2)",
        "Red Blood Cell (RBC): 4.8 M/uL    (4.3 - 5.9)",
        "Platelet Count: 250 K/uL          (150 - 450)",
        "--------------------------------------------------",
        "Comments: Patient presents elevated glucose and high WBC indicator."
    ]
    
    y = 50
    for line in lines:
        draw.text((50, y), line, fill='black')
        y += 40
        
    os.makedirs('assets', exist_ok=True)
    img.save('assets/mock_blood_report.png')
    print("Generated assets/mock_blood_report.png successfully.")

def generate_mock_xray():
    # Create a 256x256 grayscale mock chest image (darker center, lighter rib borders)
    img = Image.new('L', (256, 256), color=30)
    draw = ImageDraw.Draw(img)
    
    # Draw simple shapes representing ribs and lungs
    draw.ellipse([50, 40, 100, 220], fill=10) # Left lung cavity (dark)
    draw.ellipse([150, 40, 200, 220], fill=10) # Right lung cavity (dark)
    draw.ellipse([100, 90, 150, 170], fill=50) # Heart shadow (medium light)
    
    # Draw rib-like bars
    for y in range(60, 200, 20):
        draw.line([30, y, 110, y], fill=120, width=4)
        draw.line([140, y, 220, y], fill=120, width=4)
        
    os.makedirs('assets', exist_ok=True)
    img.save('assets/mock_chest_xray.png')
    print("Generated assets/mock_chest_xray.png successfully.")

if __name__ == '__main__':
    generate_mock_blood_report()
    generate_mock_xray()
