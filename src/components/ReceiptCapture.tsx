import { useState } from "react";
import { Camera, Upload, Check, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ReceiptReview } from "./ReceiptReview";

interface ReceiptCaptureProps {
  onUploadSuccess?: () => void;
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
      const { data: ocrResult, error: ocrError } =
        await supabase.functions.invoke("process-receipt-ocr", {
          body: {
            receiptId: "temp-processing",
            imageUrl: publicUrl,
          },
        });

      if (ocrError) {
        console.error("OCR processing error:", ocrError);
        toast({
          title: "Processing Error",
          description: "Failed to process receipt text. Please try again.",
          variant: "destructive",
        });
        return;
      }

      if (!ocrResult?.success || !ocrResult?.parsedData) {
        console.error("OCR returned invalid data:", ocrResult);
        toast({
          title: "Processing Error",
          description: "Could not extract data from receipt. Please try again.",
          variant: "destructive",
        });
        return;
      }

      console.log("OCR processing completed successfully");
      console.log("OCR result:", ocrResult);

      let enrichedParsedData = ocrResult.parsedData;
      if (ocrResult.parsedData?.items?.length > 0) {
        // 1. Mark discount lines first
        const itemsWithFlags = ocrResult.parsedData.items.map((item: any) => ({
          ...item,
          is_discount: isDiscountLine(item.item_name, item.total_price),
          confidence: "ocr", // Start with base confidence
        }));

        const storeChain = ocrResult.parsedData.store_name?.includes(
          "Superstore"
        )
          ? "Real Canadian Superstore"
          : ocrResult.parsedData.store_name || "Unknown";

        // 2. Separate items that have a product code for lookup
        const itemsToLookup = itemsWithFlags.filter(
          (item: any) =>
            !item.is_discount &&
            item.product_code &&
            item.product_code.length >= 4
        );
        const lookupSkus = itemsToLookup.map((item: any) => item.product_code);

        const verifiedProductsMap = new Map();

        // 3. Fetch verified products from DB
        if (lookupSkus.length > 0) {
          console.log(
            `Checking for ${lookupSkus.length} previously verified products...`
          );
          const { data: verifiedProducts, error: verifiedError } =
            await supabase
              .from("verified_products")
              .select("sku, product_name, brand, size, category")
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
        const finalItems: any[] = [];
        const itemsForAIEnrichment: any[] = [];

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
        if (itemsForAIEnrichment.length > 0) {
          console.log(
            `Enriching ${itemsForAIEnrichment.length} new products with AI...`
          );
          try {
            const { data: enrichmentData } = await supabase.functions.invoke(
              "enrich-product",
              {
                body: { items: itemsForAIEnrichment },
              }
            );

            if (enrichmentData?.results) {
              console.log("AI Enrichment results:", enrichmentData.results);
              const aiResultsMap = new Map(
                Object.entries(enrichmentData.results)
              );

              // Update items in the final list with AI suggestions
              for (let i = 0; i < finalItems.length; i++) {
                const item = finalItems[i];
                if (item.product_code && aiResultsMap.has(item.product_code)) {
                  const enriched: any = aiResultsMap.get(item.product_code);

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

                  if (isValidEnrichment) {
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

        enrichedParsedData = { ...ocrResult.parsedData, items: finalItems };
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
  const parseReceiptDate = (dateStr: string): string => {
    if (!dateStr) return new Date().toISOString().split("T")[0];

    // Handle format: YY/MM/DD HH:MM:SS (e.g., "25/07/30 19:46:28")
    const shortYearMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{2})/);
    if (shortYearMatch) {
      const [, yy, mm, dd] = shortYearMatch;
      const year = parseInt(yy) < 50 ? `20${yy}` : `19${yy}`;
      return `${year}-${mm}-${dd}`;
    }

    // Handle format: YYYY-MM-DD (already correct)
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      return dateStr.split("T")[0];
    }

    // Handle format: DD/MM/YYYY or MM/DD/YYYY
    const longYearMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (longYearMatch) {
      const [, a, b, year] = longYearMatch;
      // Assume DD/MM/YYYY for Canadian receipts
      return `${year}-${b}-${a}`;
    }

    // Fallback to today's date
    return new Date().toISOString().split("T")[0];
  };

  const handleApprove = async (finalData: any) => {
    if (!user || !reviewData) return;

    try {
      const parsedDate = parseReceiptDate(finalData.receipt_date);

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
            finalData.items.map((item: any) => ({
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
        (item: any) =>
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
            .eq("sku", item.product_code)
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
              sku: item.product_code,
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
              <div className="absolute top-2 right-2 bg-success text-success-foreground rounded-full p-1">
                <Check className="h-4 w-4" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-success font-medium">
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
