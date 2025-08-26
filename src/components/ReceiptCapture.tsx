import { useState } from "react";
import { Camera, Upload, Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import sampleReceipt from "@/assets/sample-receipt.jpg";

export const ReceiptCapture = () => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const { toast } = useToast();

  const handleCapture = () => {
    setIsCapturing(true);
    // Simulate camera capture
    setTimeout(() => {
      setCapturedImage(sampleReceipt);
      setIsCapturing(false);
      toast({
        title: "Receipt Captured!",
        description: "Processing with OCR technology...",
      });
    }, 2000);
  };

  const handleUpload = () => {
    // Simulate file upload
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setCapturedImage(e.target?.result as string);
          toast({
            title: "Receipt Uploaded!",
            description: "Processing with OCR technology...",
          });
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  return (
    <Card className="bg-gradient-to-br from-card to-accent/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Capture Receipt
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {!capturedImage ? (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center bg-muted/20">
              <Camera className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                Take a photo or upload your grocery receipt
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button 
                  variant="capture" 
                  size="lg"
                  onClick={handleCapture}
                  disabled={isCapturing}
                >
                  {isCapturing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                      Capturing...
                    </>
                  ) : (
                    <>
                      <Camera className="h-4 w-4" />
                      Take Photo
                    </>
                  )}
                </Button>
                <Button variant="outline" size="lg" onClick={handleUpload}>
                  <Upload className="h-4 w-4" />
                  Upload Image
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <img 
                src={capturedImage} 
                alt="Captured receipt" 
                className="w-full max-w-sm mx-auto rounded-lg shadow-lg"
              />
              <div className="absolute top-2 right-2 bg-success text-success-foreground rounded-full p-1">
                <Check className="h-4 w-4" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-success font-medium">Receipt processed successfully!</p>
              <p className="text-sm text-muted-foreground">
                OCR analysis complete - data ready for review
              </p>
              <Button variant="hero" onClick={() => setCapturedImage(null)}>
                Capture Another
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};