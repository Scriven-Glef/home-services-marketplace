import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { Button } from '@/components/ui/button'
import { CreditCard } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

import { getSessionUserId } from '@/lib/auth';

export default async function PaymentPage({ searchParams }: { searchParams: Promise<{ bookingId?: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login');

  const resolvedParams = await searchParams;
  if (!resolvedParams.bookingId) {
    redirect('/')
  }

  const supabase = await createClient()
  
  // Fetch booking to get selected services
  const { data: booking } = await supabase
    .from('bookings')
    .select('catalog_service_ids')
    .eq('id', resolvedParams.bookingId)
    .single()

  let estimatedRepairCost = 0
  if (booking && booking.catalog_service_ids && booking.catalog_service_ids.length > 0) {
    const { data: services } = await supabase
      .from('service_catalog')
      .select('base_price')
      .in('id', booking.catalog_service_ids)
    
    if (services) {
      estimatedRepairCost = services.reduce((sum: number, s: any) => sum + (s.base_price || 0), 0)
    }
  }

  return (
    <div className="max-w-md mx-auto px-6 py-24 text-center">
      <div className="mx-auto h-20 w-20 rounded-full bg-indigo-50 flex items-center justify-center mb-6">
        <CreditCard className="h-10 w-10 text-indigo-500" />
      </div>
      <h2 className="text-3xl font-bold text-slate-900 mb-2">Complete Payment</h2>
      <p className="text-slate-500 mb-8">
        Pay the ₹150 inspection fee to confirm your booking and dispatch the technician.
      </p>

      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-6 mb-8 text-left space-y-4">
        <div className="space-y-3 pb-4 border-b border-slate-200">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500">Est. Repair Cost (Based on symptoms)</span>
            <span className="font-medium text-slate-700">~₹{estimatedRepairCost}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500">Upfront Inspection Fee</span>
            <span className="font-medium text-slate-700">₹150</span>
          </div>
        </div>
        
        <div className="flex justify-between items-center pt-2 pb-4 border-b border-slate-200 border-dashed text-indigo-600 bg-indigo-50/50 -mx-6 px-6 py-3">
          <span className="text-xs font-bold uppercase tracking-wider">Likely Final Total</span>
          <span className="font-bold">~₹{estimatedRepairCost + 150}</span>
        </div>

        <div className="flex justify-between items-center pt-2">
          <span className="font-bold text-slate-900 text-lg">Amount to Pay Now</span>
          <span className="font-extrabold text-indigo-700 text-3xl">₹150</span>
        </div>
      </div>
      
      {/* Dummy Payment Form */}
      <form action={async () => {
        'use server'
        const supabase = await createClient()
        // Generate a random 6-digit order number (e.g., DM-492817)
        const orderNumber = 'DM-' + Math.floor(100000 + Math.random() * 900000)

        await supabase
          .from('bookings')
          .update({ order_number: orderNumber })
          .eq('id', resolvedParams.bookingId)

        revalidatePath('/bookings')
        revalidatePath('/vendor')
        revalidatePath('/admin', 'layout')
        revalidatePath('/admin/bookings')

        // In a real app, this is where you'd create a Razorpay/Stripe session
        redirect(`/payment/success?bookingId=${resolvedParams.bookingId}`)
      }}>
        <Button type="submit" size="lg" className="w-full bg-indigo-600 hover:bg-indigo-700 font-bold h-14 text-lg shadow-md shadow-indigo-200">
          Pay ₹150 Now (Dummy)
        </Button>
      </form>
    </div>
  )
}
