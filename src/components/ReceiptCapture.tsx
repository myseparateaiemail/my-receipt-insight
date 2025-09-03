import { useState } from "react";
import { Camera, Upload, Check, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import sampleReceipt from "@/assets/sample-receipt.jpg";
import { ReceiptReview } from "./ReceiptReview";

interface ReceiptCaptureProps {
  onUploadSuccess?: () => void;
}

export const ReceiptCapture = ({ onUploadSuccess }: ReceiptCaptureProps) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [uploadedReceiptId, setUploadedReceiptId] = useState<string | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewData, setReviewData] = useState<{
    imageUrl: string;
    rawText: string;
    parsedData: any;
    receiptId: string;
  } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

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

  const processReceiptFile = async (file: File) => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to upload receipts",
        variant: "destructive",
      });
      return;
    }

    console.log('Uploading file:', file.name);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Upload image to Supabase storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Upload error:', uploadError);
        toast({
          title: "Upload Failed",
          description: "Failed to upload receipt image",
          variant: "destructive",
        });
        return;
      }

      setUploadProgress(30);

      // Get the public URL for the uploaded image
      const { data: { publicUrl } } = supabase.storage
        .from('receipts')
        .getPublicUrl(filePath);

      console.log('Image uploaded successfully, URL:', publicUrl);

      setUploadProgress(60);

      // Process OCR first, then create receipt record only if user approves
      console.log('Starting OCR processing...');
      const { data: ocrResult, error: ocrError } = await supabase.functions.invoke('process-receipt-ocr', {
        body: {
          receiptId: 'temp-processing', // Temporary ID for processing
          imageUrl: publicUrl,
        },
      });

      if (ocrError) {
        console.error('OCR processing error:', ocrError);
        toast({
          title: "Processing Error",
          description: "Failed to process receipt text. Please try again.",
          variant: "destructive",
        });
        return;
      }

      if (!ocrResult?.success || !ocrResult?.parsedData) {
        console.error('OCR returned invalid data:', ocrResult);
        toast({
          title: "Processing Error", 
          description: "Could not extract data from receipt. Please try again.",
          variant: "destructive",
        });
        return;
      }

      console.log('OCR processing completed successfully');
      console.log('OCR result:', ocrResult);
      
      // Set up review data instead of saving immediately
      setReviewData({
        imageUrl: publicUrl,
        rawText: ocrResult.extractedText || '',
        parsedData: ocrResult.parsedData,
        receiptId: '' // Will be set when user approves
      });
      
      setUploadProgress(100);
      setReviewMode(true);

    } catch (error) {
      console.error('Upload failed:', error);
      toast({
        title: "Error",
        description: "Upload failed. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
          setCapturedImage(e.target?.result as string);
        };
        reader.readAsDataURL(file);

        // Process the file
        await processReceiptFile(file);
      }
    };
    input.click();
  };

  const handleApprove = async (finalData: any) => {
    if (!user || !reviewData) return;

    try {
      // Create receipt record in database with approved data
      const { data: receipt, error: insertError } = await supabase
        .from('receipts')
        .insert({
          user_id: user.id,
          image_url: reviewData.imageUrl,
          receipt_date: finalData.receipt_date || new Date().toISOString().split('T')[0],
          total_amount: finalData.total_amount || 0,
          subtotal_amount: finalData.subtotal_amount,
          tax_amount: finalData.tax_amount,
          store_name: finalData.store_name,
          store_phone: finalData.store_phone,
          payment_method: finalData.payment_method,
          ocr_text: reviewData.rawText,
          processing_status: 'completed'
        })
        .select()
        .single();

      if (insertError) {
        console.error('Database insert error:', insertError);
        toast({
          title: "Save Failed",
          description: "Failed to save receipt to database",
          variant: "destructive",
        });
        return;
      }

      // Save items
      if (finalData.items?.length > 0) {
        const { error: itemsError } = await supabase
          .from('receipt_items')
          .insert(
            finalData.items.map((item: any) => ({
              receipt_id: receipt.id,
              item_name: item.item_name,
              quantity: item.quantity,
              total_price: item.total_price,
              unit_price: item.unit_price,
              product_code: item.product_code,
              line_number: item.line_number
            }))
          );

        if (itemsError) {
          console.error('Items insert error:', itemsError);
        }
      }

      toast({
        title: "Success!",
        description: "Receipt approved and saved successfully",
      });

      setReviewMode(false);
      setReviewData(null);
      setCapturedImage(null);
      onUploadSuccess?.();

    } catch (error) {
      console.error('Save failed:', error);
      toast({
        title: "Error",
        description: "Failed to save receipt. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReject = () => {
    setReviewMode(false);
    setReviewData(null);
    setCapturedImage(null);
    toast({
      title: "Receipt Rejected",
      description: "Receipt processing cancelled",
    });
  };

  const handleCancel = () => {
    setReviewMode(false);
    setReviewData(null);
  };

  if (reviewMode && reviewData) {
    return (
      <ReceiptReview
        receiptImage={reviewData.imageUrl}
        rawOcrText={reviewData.rawText}
        parsedData={reviewData.parsedData}
        onApprove={handleApprove}
        onReject={handleReject}
        onCancel={handleCancel}
      />
    );
  }

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
                Take a photo or upload your grocery receipt for automatic processing
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button 
                  variant="capture" 
                  size="lg"
                  onClick={handleCapture}
                  disabled={isCapturing || isUploading}
                >
                  {isCapturing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Capturing...
                    </>
                  ) : (
                    <>
                      <Camera className="h-4 w-4" />
                      Take Photo
                    </>
                  )}
                </Button>
                <Button 
                  variant="outline" 
                  size="lg" 
                  onClick={handleUpload}
                  disabled={isUploading || isCapturing}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Upload Image
                    </>
                  )}
                </Button>
              </div>
            </div>
            
            {isUploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Processing receipt...</span>
                  <span className="text-muted-foreground">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">
                  {uploadProgress < 30 && "Uploading image..."}
                  {uploadProgress >= 30 && uploadProgress < 60 && "Saving to database..."}
                  {uploadProgress >= 60 && uploadProgress < 100 && "Extracting text with OCR..."}
                  {uploadProgress === 100 && "Complete!"}
                </p>
              </div>
            )}
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
              <p className="text-success font-medium">
                {uploadedReceiptId ? "Receipt processed and saved!" : "Receipt captured successfully!"}
              </p>
              <p className="text-sm text-muted-foreground">
                {uploadedReceiptId ? "Text extracted and stored automatically" : "Ready for processing"}
              </p>
              <Button 
                variant="hero" 
                onClick={() => {
                  setCapturedImage(null);
                  setUploadedReceiptId(null);
                }}
                disabled={isUploading}
              >
                Process Another Receipt
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};