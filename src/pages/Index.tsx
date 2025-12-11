import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { DashboardStats } from "@/components/DashboardStats";
import { ReceiptCapture } from "@/components/ReceiptCapture";
import { SpendingChart } from "@/components/SpendingChart";
import RecentReceipts from "@/components/RecentReceipts";
import { InsightsPanel } from "@/components/InsightsPanel";
import { Button } from "@/components/ui/button";
import { Camera, BarChart3, Zap } from "lucide-react";
import heroImage from "@/assets/hero-image.jpg";
import { ReceiptReview } from "@/components/ReceiptReview";
import { ParsedReceiptData, ReceiptWithItems } from "@/types";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // State to hold the receipt currently being edited
  const [editingReceipt, setEditingReceipt] = useState<ReceiptWithItems | null>(null);
  // State to trigger a refresh of the recent receipts list
  const [receiptsVersion, setReceiptsVersion] = useState(0);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  const handleUploadSuccess = () => {
    // Increment version to trigger a re-fetch in RecentReceipts
    setReceiptsVersion(v => v + 1);
    // Invalidate spending analytics to refresh charts
    queryClient.invalidateQueries({ queryKey: ["spending-analytics"] });
  };

  const handleEditReceipt = async (receipt: ReceiptWithItems) => {
    // Fetch sizes from verified_products to populate the edit view
    // Since receipt_items table doesn't have size, we rely on the verified products knowledge base
    const skus = receipt.items
        .map((i) => i.product_code)
        .filter((c): c is string => !!c && c.length >= 3);

    let sizeMap: Record<string, string> = {};

    if (skus.length > 0) {
        const { data: verified } = await supabase
            .from('verified_products')
            .select('sku, size')
            .in('sku', skus);
        
        if (verified) {
            verified.forEach((v) => {
                if (v.size) sizeMap[v.sku] = v.size;
            });
        }
    }

    // Attach size to items (casting to any to bypass strict type check for the temporary 'size' prop)
    const itemsWithSize = receipt.items.map(item => ({
        ...item,
        size: item.product_code ? sizeMap[item.product_code] : undefined
    }));

    setEditingReceipt({
        ...receipt,
        items: itemsWithSize as any 
    });
  };

  const handleFinishEditing = () => {
    setEditingReceipt(null);
  };

  const handleApproval = async (finalData: ParsedReceiptData) => {
    if (!editingReceipt || !user) return;

    try {
        // 1. Update Receipt Details
        const { error: receiptError } = await supabase
            .from('receipts')
            .update({
                store_name: finalData.store_name,
                receipt_date: finalData.receipt_date, // This should be YYYY-MM-DD from the date picker
                total_amount: finalData.total_amount,
                subtotal_amount: finalData.subtotal_amount,
                tax_amount: finalData.tax_amount,
                card_last_four: finalData.card_last_four,
                payment_method: finalData.payment_method,
            })
            .eq('id', editingReceipt.id);

        if (receiptError) throw receiptError;

        // 2. Update Items
        // Strategy: Delete all existing items and re-insert current list
        // This handles deleted items, new items, and modified items.
        
        const { error: deleteError } = await supabase
            .from('receipt_items')
            .delete()
            .eq('receipt_id', editingReceipt.id);
            
        if (deleteError) throw deleteError;

        if (finalData.items && finalData.items.length > 0) {
            const itemsToInsert = finalData.items.map((item, index) => ({
                receipt_id: editingReceipt.id,
                item_name: item.item_name,
                quantity: item.quantity,
                total_price: item.total_price,
                unit_price: item.unit_price,
                product_code: item.product_code,
                line_number: index + 1, // Re-index
                category: item.category,
                brand: item.brand,
                description: item.description || (item as any).size || undefined, // mapping fallback
                discount_amount: item.discount_amount || 0
            }));

            const { error: insertError } = await supabase
                .from('receipt_items')
                .insert(itemsToInsert);
                
            if (insertError) throw insertError;
        }

        // 3. Update Verified Products (Save the Size!)
        const itemsToVerify = finalData.items?.filter(
            (item) =>
            item.product_code &&
            item.item_name &&
            !item.is_discount &&
            item.product_code.length >= 3
        );

        if (itemsToVerify?.length > 0) {
            for (const item of itemsToVerify) {
                const storeChain = finalData.store_name?.includes("Superstore")
                    ? "Real Canadian Superstore"
                    : finalData.store_name || "Unknown";

                const { data: existing } = await supabase
                    .from("verified_products")
                    .select("id, verification_count")
                    .eq("sku", item.product_code as string)
                    .eq("store_chain", storeChain)
                    .maybeSingle();

                if (existing) {
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
        }

        toast({
          title: "Success",
          description: "Receipt updated and verified data saved successfully",
        });

        setEditingReceipt(null);
        handleUploadSuccess(); // Refresh list

    } catch (error: any) {
        console.error("Error updating receipt:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to update receipt",
          variant: "destructive",
        });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/10 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to auth
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Header />

      {/* Conditionally render the Hero Section or hide it during editing */}
      {!editingReceipt && (
        <section className="relative py-16 overflow-hidden">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <div className="space-y-4">
                  <h1 className="text-4xl md:text-5xl font-bold text-foreground leading-tight">
                    Transform Your{" "}
                    <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
                      Grocery Receipts
                    </span>{" "}
                    Into Smart Insights
                  </h1>
                  <p className="text-xl text-muted-foreground leading-relaxed">
                    Automatically transcribe receipts with OCR, track spending patterns, reduce food waste, and discover savings opportunities with AI-powered analytics.
                  </p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button variant="default" size="lg" className="text-lg">
                    <Camera className="h-5 w-5" />
                    Scan Your First Receipt
                  </Button>
                  <Button variant="outline" size="lg" className="text-lg">
                    <BarChart3 className="h-5 w-5" />
                    View Demo Dashboard
                  </Button>
                </div>
                
                <div className="flex items-center gap-6 pt-4">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    <span className="text-sm text-muted-foreground">Instant OCR</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    <span className="text-sm text-muted-foreground">Smart Analytics</span>
                  </div>
                </div>
              </div>
              
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 rounded-3xl transform rotate-6"></div>
                <img 
                  src={heroImage} 
                  alt="Receipt scanning app interface"
                  className="relative rounded-3xl shadow-2xl w-full h-auto"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Dashboard Section */}
      <section className="py-12">
        <div className="container mx-auto px-4 space-y-8">
          {editingReceipt ? (
            // Render the full-width ReceiptReview component when editing
            <ReceiptReview
              receiptImage={editingReceipt.image_url || ""}
              rawOcrText={editingReceipt.ocr_text || ""}
              parsedData={{
                ...editingReceipt, 
                // Ensure items match OcrItem type, assuming ReceiptItem is compatible or needs mapping
                items: editingReceipt.items.map(item => ({
                  ...item,
                  // Provide defaults for optional fields if necessary to match OcrItem
                  item_name: item.item_name,
                  quantity: item.quantity ?? 1,
                  total_price: item.total_price ?? 0,
                  unit_price: item.unit_price ?? 0,
                  product_code: item.product_code || undefined,
                  line_number: item.line_number || undefined,
                  category: item.category || undefined,
                  brand: item.brand || undefined,
                  size: (item as any).size || undefined, // Use the fetched size
                  description: item.description || undefined,
                  discount_amount: item.discount_amount || undefined,
                  is_discount: false, // Default or logic to determine
                  confidence: 'verified' // Since it's from DB, assume verified or map appropriately
                }))
              }}
              onApprove={handleApproval}
              onReject={handleFinishEditing}
              onCancel={handleFinishEditing}
            />
          ) : (
            // Render the standard dashboard view
            <>
              <DashboardStats />
              <div className="space-y-8">
                <ReceiptCapture onUploadSuccess={handleUploadSuccess} />
                <SpendingChart />
                <div className="grid md:grid-cols-2 gap-8">
                  <RecentReceipts 
                    key={receiptsVersion} // Use key to force re-render/re-fetch
                    onEditReceipt={handleEditReceipt} 
                  />
                  <InsightsPanel />
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default Index;
