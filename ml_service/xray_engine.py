import os
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForImageClassification

class MedicalXrayEngine:
    def __init__(self):
        # We use a popular pre-trained ViT model from Hugging Face fine-tuned for pneumonia detection
        self.model_name = "dima806/chest_xray_pneumonia_detection"
        print(f"Loading pre-trained X-ray model: {self.model_name}...")
        self.processor = AutoImageProcessor.from_pretrained(self.model_name)
        self.model = AutoModelForImageClassification.from_pretrained(self.model_name)
        
    def classify_xray(self, image_path):
        """Loads a chest X-ray image, pre-processes it, and runs inference.
        Returns the classification label and confidence.
        """
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"X-ray image not found at: {image_path}")
            
        print(f"Analyzing X-ray: {image_path}...")
        image = Image.open(image_path).convert("RGB")
        
        # Pre-process image
        inputs = self.processor(images=image, return_tensors="pt")
        
        # Run inference (no gradients needed)
        with torch.no_grad():
            outputs = self.model(**inputs)
            
        logits = outputs.logits
        # Calculate probabilities using Softmax
        probabilities = torch.nn.functional.softmax(logits, dim=-1)[0]
        
        # Get highest probability index and value
        pred_idx = logits.argmax(-1).item()
        confidence = probabilities[pred_idx].item()
        
        # Get label from model config
        label = self.model.config.id2label[pred_idx]
        
        # Clean up labels (typically model outputs like "normal" or "pneumonia")
        return {
            "pathology": label,
            "confidence": round(confidence, 4)
        }

if __name__ == '__main__':
    # Test execution
    # Ensure assets exist
    if not os.path.exists('assets/mock_chest_xray.png'):
        print("Generating mock data first...")
        from create_mock_data import generate_mock_xray
        generate_mock_xray()
        
    engine = MedicalXrayEngine()
    results = engine.classify_xray('assets/mock_chest_xray.png')
    
    print("\n--- X-Ray Analysis Results ---")
    print(results)
    print("-------------------------------")
