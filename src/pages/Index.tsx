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
import { ReceiptReview } from "@/components/ReceiptReview"; // Import ReceiptReview

// Define the shape of a receipt object for type safety
interface Receipt {
  id: string;
  receipt_date: string;
  store_name: string;
  total_amount: number;
  processing_status: string;
  image_url: string;
  ocr_text: string;
  items: any[];
}

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  // State to hold the receipt currently being edited
  const [editingReceipt, setEditingReceipt] = useState<Receipt | null>(null);
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
  };

  const handleEditReceipt = (receipt: Receipt) => {
    setEditingReceipt(receipt);
  };

  const handleFinishEditing = () => {
    setEditingReceipt(null);
  };

  const handleApproval = async (finalData: any) => {
    if (!editingReceipt) return;

    console.log("Approved data to be saved:", finalData);
    
    // In a real scenario, you'd save this data to Supabase
    // e.g., await supabase.from('receipts').update(...).eq('id', editingReceipt.id)
    
    setEditingReceipt(null); // Close the review component
    handleUploadSuccess(); // Trigger a refresh of the receipt list
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
                  <Button variant="hero" size="lg" className="text-lg">
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
              receiptImage={editingReceipt.image_url}
              rawOcrText={editingReceipt.ocr_text}
              parsedData={{ ...editingReceipt, items: editingReceipt.items }}
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
