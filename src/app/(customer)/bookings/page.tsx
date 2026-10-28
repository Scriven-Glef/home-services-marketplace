export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { Suspense } from 'react'
import { getCustomerBookings, respondToQuote } from '../actions'
import { getSessionUserId } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CalendarCheck, MapPin, Clock } from 'lucide-react'
import { AutoRefresher } from '@/components/AutoRefresher'

const STATUSES = ['pending', 'vendor_assigned', 'in_transit', 'completed']
const STATUS_LABELS: Record<string, string> = {
  pending: 'Booked',
  vendor_assigned: 'Vendor Assigned',
  in_transit: 'In Transit',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

function BookingTimeline({ currentStatus }: { currentStatus: string }) {
  const isCancelled = currentStatus === 'cancelled' || currentStatus === 'refunded'
  const currentIndex = STATUSES.indexOf(currentStatus)

  if (isCancelled) {
    return (
      <div className="flex items-center gap-2 mt-3">
        <div className="h-3 w-3 rounded-full bg-rose-500" />
        <span className="text-sm font-medium text-rose-600">{STATUS_LABELS[currentStatus]}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 mt-4">
      {STATUSES.map((status, index) => {
        const isActive = index <= currentIndex
        const isCurrent = index === currentIndex
        return (
          <div key={status} className="flex items-center gap-1">
            <div className="flex flex-col items-center">
              <div
                className={`h-3.5 w-3.5 rounded-full border-2 transition-all duration-300 ${
                  isCurrent
                    ? 'bg-indigo-600 border-indigo-600 ring-4 ring-indigo-100'
                    : isActive
                    ? 'bg-emerald-500 border-emerald-500'
                    : 'bg-white border-slate-300'
                }`}
              />
              <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${
                isActive ? 'text-slate-700' : 'text-slate-400'
              }`}>
                {STATUS_LABELS[status]}
              </span>
            </div>
            {index < STATUSES.length - 1 && (
              <div className={`h-0.5 w-8 sm:w-12 mb-4 transition-colors duration-300 ${
                index < currentIndex ? 'bg-emerald-500' : 'bg-slate-200'
              }`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      {[1, 2].map(i => (
        <Card key={i} className="animate-pulse">
          <CardContent className="p-6 h-36 bg-slate-50"></CardContent>
        </Card>
      ))}
    </div>
  )
}

async function BookingsList() {
  const userId = await getSessionUserId();
  if (!userId) redirect('/login?redirectTo=/bookings');
  const bookings = await getCustomerBookings()

  if (bookings.length === 0) {
    return (
      <div className="text-center py-20 border-2 border-dashed rounded-xl">
        <CalendarCheck className="mx-auto h-14 w-14 text-slate-300 mb-4" />
        <h3 className="text-lg font-semibold text-slate-500">No bookings yet</h3>
        <p className="text-slate-400 mt-1">Once you book a service, it will appear here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {bookings.map((booking: any) => (
        <Card key={booking.id} className="hover:shadow-md transition-shadow overflow-hidden">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded border border-slate-200">
                    {booking.order_number || 'Processing'}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {booking.services && booking.services.length > 0 
                    ? booking.services.map((s: any) => s.service_name).join(', ')
                    : 'Service Request'}
                </h3>
                <p className="text-sm text-slate-500">
                  {booking.services && booking.services.length > 0 ? booking.services[0].category : 'Various'}
                </p>
                <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-2">
                  <MapPin size={14} /> {booking.service_address}
                </div>
                <p className="text-sm text-slate-400">
                  Vendor: <span className="font-medium text-slate-600">{booking.vendor?.name || 'Pending Assignment'}</span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm text-slate-500">
                  {new Date(booking.scheduled_time).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric'
                  })}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(booking.scheduled_time).toLocaleTimeString('en-IN', {
                    hour: '2-digit', minute: '2-digit'
                  })}
                </p>
                <div className="text-right">
                  {booking.quote_status === 'approved' && booking.final_quoted_price ? (
                    <>
                      <p className="text-xs text-slate-500 mb-1">Final Price</p>
                      <p className="text-xl font-bold text-slate-900">₹{booking.final_quoted_price}</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-slate-500 mb-1">Inspection Fee</p>
                      <p className="text-lg font-bold text-slate-900 mt-1">₹150</p>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            {booking.estimated_logistics_time_mins && (
              <div className="mt-4 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 inline-flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-amber-700">
                  ETA: ~{booking.estimated_logistics_time_mins} mins
                </span>
              </div>
            )}
            
            <BookingTimeline currentStatus={booking.status} />

            {booking.quote_status === 'provided' && (
              <div className="mt-6 p-5 bg-indigo-50 border border-indigo-100 rounded-xl">
                <h4 className="font-bold text-indigo-900 mb-2">Vendor Final Quote: ₹{booking.final_quoted_price}</h4>
                <p className="text-sm text-indigo-700 mb-4">The technician has inspected the issue and provided this final price for the repair. Do you accept?</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href={`/payment/final?bookingId=${booking.id}`} className="w-full block">
                    <Button type="button" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold">Approve & Pay</Button>
                  </Link>
                  <form action={async () => { "use server"; await respondToQuote(booking.id, 'declined') }} className="w-full">
                    <Button variant="outline" className="w-full text-indigo-700 border-indigo-200 hover:bg-indigo-100 font-bold">Decline (Pay Inspection Only)</Button>
                  </form>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export default function CustomerBookingsPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">My Bookings</h1>
          <p className="text-slate-500">Track your active and past service requests.</p>
        </div>
        <AutoRefresher intervalSeconds={8} label="Live Status" />
      </div>
      
      <Suspense fallback={<LoadingSkeleton />}>
        <BookingsList />
      </Suspense>
    </div>
  )
}
