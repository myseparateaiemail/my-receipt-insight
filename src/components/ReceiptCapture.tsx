import { useState } from "react";
import { Camera, Upload, Check, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ReceiptReview } from "./ReceiptReview";
import { OcrItem, ParsedReceiptData, VerifiedProduct } from "@/types";
import { processReceiptWithGeminiClient } from "@/lib/gemini";

interface ReceiptCaptureProps {
  onUploadSuccess?: () => void;
}

interface ReviewData {
  imageUrl: string;
  rawText: string;
  parsedData: ParsedReceiptData;
  receiptId: string;
}

interface AIEnrichmentResult {
  fullName: string;
  size?: string;
  brand?: string;
  category?: string;
  confidence?: 'ocr' | 'verified' | 'ai_suggested' | 'fallback';
}

export const ReceiptCapture = ({ onUploadSuccess }: ReceiptCaptureProps) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [uploadedReceiptId, setUploadedReceiptId] = useState<string | null>(
    null
  );
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleCapture = () => {
    setIsCapturing(true);
    setTimeout(() => {
      setCapturedImage("/hero-image.jpg");
      setIsCapturing(false);
      toast({
        title: "Receipt Captured!",
        description: "Processing with OCR technology...",
      });
    }, 2000);
  };

  // Check if a line is a discount/adjustment
  const isDiscountLine = (itemName: string, price: number): boolean => {
    const discountPatterns = [
      /^ARCP/i,
      /discount/i,
      /savings/i,
      /^-/,
      /%\s*\(/,
    ];
    return price < 0 || discountPatterns.some((p) => p.test(itemName));
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

    console.log("Uploading file:", file.name);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(filePath, file);

      if (uploadError) {
        console.error("Upload error:", uploadError);
        toast({
          title: "Upload Failed",
          description: "Failed to upload receipt image",
          variant: "destructive",
        });
        return;
      }

      setUploadProgress(30);

      const {
        data: { publicUrl },
      } = supabase.storage.from("receipts").getPublicUrl(filePath);

      console.log("Image uploaded successfully, URL:", publicUrl);

      setUploadProgress(60);

      console.log("Starting OCR processing...");
      
      let ocrResult;
      
      // Attempt Server-Side Processing First
      try {
        const { data, error } = await supabase.functions.invoke("process-receipt-ocr", {
          body: {
            receiptId: "temp-processing",
            imageUrl: publicUrl,
          },
        });
        
        if (error) throw error;
        ocrResult = data;
      } catch (serverError) {
        console.error("Server-side processing failed:", serverError);
        
        // Fallback to Client-Side Processing
        const apiKey = localStorage.getItem("gemini_api_key");
        if (apiKey) {
           console.log("Falling back to client-side processing...");
           toast({
             title: "Server Busy",
             description: "Using local processing with your API Key...",
           });
           try {
             ocrResult = await processReceiptWithGeminiClient(publicUrl, apiKey);
             // Normalize result structure
             ocrResult = { success: true, ...ocrResult };
           } catch (clientError) {
             console.error("Client-side processing failed:", clientError);
             throw new Error(`Client processing failed: ${clientError.message}`);
           }
        } else {
           // No API Key configured
           toast({
             title: "Processing Failed",
             description: "Server unavailable. Please go to Settings and add your Gemini API Key to enable local processing.",
             variant: "destructive",
             action: <Button variant="outline" size="sm" onClick={() => document.querySelector<HTMLElement>('button[aria-haspopup="dialog"]')?.click()}>Settings</Button>
           });
           return;
        }
      }

      if (!ocrResult?.success || !ocrResult?.parsedData) {
        console.error("OCR returned invalid data:", ocrResult);
        const failMessage = ocrResult?.error || "Could not extract data from receipt.";
        toast({
          title: "Processing Error",
          description: failMessage,
          variant: "destructive",
        });
        return;
      }

      console.log("OCR processing completed successfully");
      console.log("OCR result:", ocrResult);

      let enrichedParsedData: ParsedReceiptData = ocrResult.parsedData;
      
      if (enrichedParsedData.items && enrichedParsedData.items.length > 0) {
        // 1. Mark discount lines first
        const itemsWithFlags: OcrItem[] = enrichedParsedData.items.map((item: OcrItem) => ({
          ...item,
          is_discount: isDiscountLine(item.item_name, item.total_price),
          confidence: "ocr", // Start with base confidence
        }));

        const storeChain = enrichedParsedData.store_name?.includes(
          "Superstore"
        )
          ? "Real Canadian Superstore"
          : enrichedParsedData.store_name || "Unknown";

        // 2. Separate items that have a product code for lookup
        const itemsToLookup = itemsWithFlags.filter(
          (item) =>
            !item.is_discount &&
            item.product_code &&
            item.product_code.length >= 4
        );
        const lookupSkus = itemsToLookup.map((item) => item.product_code).filter((code): code is string => !!code);

        const verifiedProductsMap = new Map<string, VerifiedProduct>();

        // 3. Fetch verified products from DB
        if (lookupSkus.length > 0) {
          console.log(
            `Checking for ${lookupSkus.length} previously verified products...`
          );
          const { data: verifiedProducts, error: verifiedError } =
            await supabase
              .from("verified_products")
              .select("*")
              .in("sku", lookupSkus)
              .eq("store_chain", storeChain);

          if (verifiedError) {
            console.error("Error fetching verified products:", verifiedError);
            // Not a fatal error, we can continue without verified data
          } else if (verifiedProducts) {
            console.log(
              `Found ${verifiedProducts.length} matches in verified products db.`
            );
            verifiedProducts.forEach((p) => verifiedProductsMap.set(p.sku, p));
          }
        }

        // 4. Build the final item list, separating items that need AI enrichment
        const finalItems: OcrItem[] = [];
        const itemsForAIEnrichment: { product_code: string; item_name: string }[] = [];

        for (const item of itemsWithFlags) {
          // If it's a discount, just add it and continue
          if (item.is_discount) {
            finalItems.push(item);
            continue;
          }

          const verifiedProduct = item.product_code
            ? verifiedProductsMap.get(item.product_code)
            : null;

          if (verifiedProduct) {
            // Use previously verified data
            finalItems.push({
              ...item,
              item_name: verifiedProduct.product_name,
              brand: verifiedProduct.brand || item.brand,
              size: verifiedProduct.size || item.size,
              category: verifiedProduct.category || item.category,
              confidence: "verified", // Mark as verified
            });
          } else {
            // This item needs processing. If it has a code, add to AI list.
            if (item.product_code && item.product_code.length >= 4) {
              itemsForAIEnrichment.push({
                product_code: item.product_code,
                item_name: item.item_name,
              });
            }
            // Add the original item to the list for now. It will be updated if AI finds a match.
            finalItems.push(item);
          }
        }

        // 5. Enrich the remaining items with AI
        // NOTE: We also need to handle Client-Side Fallback for Enrichment if Server fails!
        if (itemsForAIEnrichment.length > 0) {
          console.log(
            `Enriching ${itemsForAIEnrichment.length} new products with AI...`
          );
          try {
            let enrichmentData;
            try {
                const { data } = await supabase.functions.invoke(
                  "enrich-product",
                  {
                    body: { items: itemsForAIEnrichment },
                  }
                );
                enrichmentData = data;
            } catch (enrichServerError) {
                console.error("Enrichment server failed, trying client fallback...", enrichServerError);
                // We skip client fallback for enrichment to keep complexity down for now.
                // Or we could implement it if we really wanted to.
                // For now, let's just use original names if server fails.
            }

            if (enrichmentData?.results) {
              console.log("AI Enrichment results:", enrichmentData.results);
              const aiResultsMap = new Map<string, AIEnrichmentResult>(
                Object.entries(enrichmentData.results)
              );

              // Update items in the final list with AI suggestions
              for (let i = 0; i < finalItems.length; i++) {
                const item = finalItems[i];
                if (item.product_code && aiResultsMap.has(item.product_code)) {
                  const enriched = aiResultsMap.get(item.product_code);

                  const invalidPatterns = [
                    "superstore",
                    "walmart",
                    "real canadian",
                    "loblaws",
                    "no frills",
                  ];
                  const isValidEnrichment =
                    enriched?.fullName &&
                    !invalidPatterns.some((p) =>
                      enriched.fullName.toLowerCase().includes(p)
                    ) &&
                    enriched.fullName.length > 3 &&
                    enriched.fullName !== item.item_name;

                  if (isValidEnrichment && enriched) {
                    finalItems[i] = {
                      ...item,
                      item_name: enriched.fullName,
                      size: enriched.size || item.size || "",
                      brand: enriched.brand || item.brand || "",
                      category: enriched.category || item.category,
                      confidence: enriched.confidence || "ai_suggested",
                    };
                  }
                }
              }
            }
          } catch (enrichError) {
            console.log(
              "AI Enrichment failed, using original names for new items:",
              enrichError
            );
          }
        }

        enrichedParsedData = { ...enrichedParsedData, items: finalItems };
      }

      setReviewData({
        imageUrl: publicUrl,
        rawText: ocrResult.ocrText || "",
        parsedData: enrichedParsedData,
        receiptId: "",
      });

      setUploadProgress(100);
      setReviewMode(true);
    } catch (error) {
      console.error("Upload failed:", error);
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
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setCapturedImage(e.target?.result as string);
        };
        reader.readAsDataURL(file);

        await processReceiptFile(file);
      }
    };
    input.click();
  };

  // Parse receipt date from various formats to YYYY-MM-DD
  const parseReceiptDate = (dateStr?: string, storeName?: string): string => {
    if (!dateStr) return new Date().toISOString().split("T")[0];

    const cleanDate = dateStr.trim();

    // 1. ISO Format: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(cleanDate)) {
      return cleanDate.split("T")[0];
    }

    // 2. Handle XX/XX/XX or XX-XX-XX or XX.XX.XX
    const parts = cleanDate.split(/[\/\-\.]/);
    if (parts.length === 3) {
      const [p1, p2, p3] = parts;
      
      // Try to determine which part is the year
      // If p3 is 4 digits, it's the year (DD/MM/YYYY or MM/DD/YYYY)
      if (p3.length === 4) {
        const year = p3;
        // Ambiguous: p1/p2.
        // If p1 > 12, it must be Day (DD/MM/YYYY)
        if (parseInt(p1) > 12) {
             return `${year}-${p2}-${p1}`; // DD/MM/YYYY -> YYYY-MM-DD
        }
        // If Store is Walmart, prefer MM/DD/YYYY
        if (storeName && /walmart/i.test(storeName)) {
             return `${year}-${p1}-${p2}`; // MM/DD/YYYY -> YYYY-MM-DD
        }
        // Default to Canadian standard DD/MM/YYYY otherwise? 
        return `${year}-${p2}-${p1}`; 
      }

      // If p1 is 4 digits, it's YYYY/MM/DD
      if (p1.length === 4) {
        return `${p1}-${p2}-${p3}`;
      }

      // All 2 digits (or 1 digit)
      // Heuristic based on User Input (Store Name)
      // Superstore: YY/MM/DD
      if (storeName && (/superstore/i.test(storeName) || /loblaw/i.test(storeName) || /no frills/i.test(storeName))) {
        // Expecting YY/MM/DD
        // But check if p1 looks like a year (e.g. 24, 25)
        const year = parseInt(p1) < 50 ? `20${p1}` : `19${p1}`;
        return `${year}-${p2}-${p3}`;
      }
      
      // Walmart: MM/DD/YY
      if (storeName && /walmart/i.test(storeName)) {
         const year = parseInt(p3) < 50 ? `20${p3}` : `19${p3}`;
         return `${year}-${p1}-${p2}`;
      }

      // General Fallback for 2-digit parts
      // If p1 > 12, it's likely YY/MM/DD (e.g. 25/01/30)
      if (parseInt(p1) > 12 && parseInt(p2) <= 12) {
         const year = parseInt(p1) < 50 ? `20${p1}` : `19${p1}`;
         return `${year}-${p2}-${p3}`;
      }
      
      // If p3 matches current year short code (e.g. 24, 25), assume it's the year at the end
      const currentYearShort = new Date().getFullYear() % 100;
      if (parseInt(p3) >= currentYearShort - 1 && parseInt(p3) <= currentYearShort + 1) {
         const year = parseInt(p3) < 50 ? `20${p3}` : `19${p3}`;
         // Ambiguous: MM/DD/YY vs DD/MM/YY
         // If p1 > 12, then p1 is Day -> DD/MM/YY
         if (parseInt(p1) > 12) {
            return `${year}-${p2}-${p1}`;
         }
         return `${year}-${p1}-${p2}`;
      }
    }

    return new Date().toISOString().split("T")[0];
  };

  const handleApprove = async (finalData: ParsedReceiptData) => {
    if (!user || !reviewData) return;

    try {
      // Pass store_name to help with date parsing logic
      const parsedDate = parseReceiptDate(finalData.receipt_date, finalData.store_name);

      // Create receipt record
      const { data: receipt, error: insertError } = await supabase
        .from("receipts")
        .insert({
          user_id: user.id,
          image_url: reviewData.imageUrl,
          receipt_date: parsedDate,
          total_amount: finalData.total_amount || 0,
          subtotal_amount: finalData.subtotal_amount,
          tax_amount: finalData.tax_amount,
          store_name: finalData.store_name,
          card_last_four: finalData.card_last_four,
          payment_method: finalData.payment_method,
          ocr_text: reviewData.rawText,
          processing_status: "completed",
        })
        .select()
        .single();

      if (insertError) {
        console.error("Database insert error:", insertError);
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
          .from("receipt_items")
          .insert(
            finalData.items.map((item) => ({
              receipt_id: receipt.id,
              item_name: item.item_name,
              quantity: item.quantity,
              total_price: item.total_price,
              unit_price: item.unit_price,
              discount_amount: item.discount_amount || 0,
              product_code: item.product_code,
              line_number: item.line_number,
              category: item.category,
              brand: item.brand || null,
              description: item.size || item.description,
            }))
          );

        if (itemsError) {
          console.error("Items insert error:", itemsError);
        }
      }

      // Save user corrections to verified_products table for learning
      const itemsToVerify = finalData.items?.filter(
        (item) =>
          item.product_code &&
          item.item_name &&
          !item.is_discount &&
          item.product_code.length >= 4
      );

      if (itemsToVerify?.length > 0) {
        console.log("Saving verified products for future learning...");

        for (const item of itemsToVerify) {
          const storeChain = finalData.store_name?.includes("Superstore")
            ? "Real Canadian Superstore"
            : finalData.store_name || "Unknown";

          // Check if product already exists
          const { data: existing } = await supabase
            .from("verified_products")
            .select("id, verification_count")
            .eq("sku", item.product_code as string)
            .eq("store_chain", storeChain)
            .maybeSingle();

          if (existing) {
            // Update existing record and increment count
            await supabase
              .from("verified_products")
              .update({
                product_name: item.item_name,
                brand: item.brand || null,
                size: item.size || null,
                category: item.category || null,
                verification_count: (existing.verification_count || 0) + 1,
                last_verified_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
          } else {
            // Insert new record
            await supabase.from("verified_products").insert({
              sku: item.product_code as string,
              product_name: item.item_name,
              brand: item.brand || null,
              size: item.size || null,
              category: item.category || null,
              store_chain: storeChain,
              created_by: user.id,
              verification_count: 1,
            });
          }
        }
        console.log(
          `Saved ${itemsToVerify.length} products to verified database`
        );
      }

      toast({
        title: "Success!",
        description:
          "Receipt saved. Product data saved for better future accuracy.",
      });

      setReviewMode(false);
      setReviewData(null);
      setCapturedImage(null);
      onUploadSuccess?.();
    } catch (error) {
      console.error("Save failed:", error);
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
                Take a photo or upload your grocery receipt for automatic
                processing
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  variant="default" // Changed from custom variant "capture" to default for now as "capture" might not exist or be typed
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
                  <span className="text-muted-foreground">
                    Processing receipt...
                  </span>
                  <span className="text-muted-foreground">
                    {uploadProgress}%
                  </span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">
                  {uploadProgress < 30 && "Uploading image..."}
                  {uploadProgress >= 30 &&
                    uploadProgress < 60 &&
                    "Saving to database..."}
                  {uploadProgress >= 60 &&
                    uploadProgress < 100 &&
                    "Extracting text with OCR..."}
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
              <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                <Check className="h-4 w-4" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-green-600 font-medium">
                {uploadedReceiptId
                  ? "Receipt processed and saved!"
                  : "Receipt captured successfully!"}
              </p>
              <p className="text-sm text-muted-foreground">
                {uploadedReceiptId
                  ? "Text extracted and stored automatically"
                  : "Ready for processing"}
              </p>
              <Button
                variant="default"
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
