import { Header } from "@/components/Header";
import { DashboardStats } from "@/components/DashboardStats";
import { ReceiptCapture } from "@/components/ReceiptCapture";
import { SpendingChart } from "@/components/SpendingChart";
import { RecentReceipts } from "@/components/RecentReceipts";
import { InsightsPanel } from "@/components/InsightsPanel";
import { Button } from "@/components/ui/button";
import { Camera, BarChart3, Zap } from "lucide-react";
import heroImage from "@/assets/hero-image.jpg";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <Header />
      
      {/* Hero Section */}
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

      {/* Dashboard Section */}
      <section className="py-12">
        <div className="container mx-auto px-4 space-y-8">
          <DashboardStats />
          
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <ReceiptCapture />
            </div>
            <div className="lg:col-span-2 space-y-8">
              <SpendingChart />
              <div className="grid md:grid-cols-2 gap-8">
                <RecentReceipts />
                <InsightsPanel />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
