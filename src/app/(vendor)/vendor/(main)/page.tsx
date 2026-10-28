export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { Suspense } from 'react'
import { getVendorProfile, getVendorBookings, updateBookingStatus, provideFinalQuote } from "../actions"
import { getSessionUserId } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { StatusBadge } from "@/components/StatusBadge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MapPin, CheckCircle, Truck } from "lucide-react"
import { AutoRefresher } from "@/components/AutoRefresher"

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card><CardContent className="h-24 bg-slate-50"></CardContent></Card>
        <Card><CardContent className="h-24 bg-slate-50"></CardContent></Card>
      </div>
      <Card><CardContent className="h-48 bg-slate-50"></CardContent></Card>
    </div>
  )
}

async function DashboardContent() {
  const userId = await getSessionUserId()
  if (!userId) redirect('/vendor/login')

  const [profile, bookings] = await Promise.all([
    getVendorProfile(userId),
    getVendorBookings(userId)
  ])

  if (!profile) {
    redirect('/vendor/onboarding')
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h2>
          <p className="text-slate-500 mt-2">
            Welcome back, {profile.business_name}.
          </p>
        </div>
        <AutoRefresher intervalSeconds={8} label="Live Orders" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account Status</CardTitle>
            <CardDescription>Your current onboarding and approval status.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <StatusBadge status={profile.onboarding_status} />
            {profile.onboarding_status === 'pending' && (
              <span className="text-sm text-slate-500">Awaiting admin review.</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Availability</CardTitle>
            <CardDescription>Toggle whether you are accepting new jobs.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center space-x-2">
            {/* Note: Wiring this to the DB requires a separate boolean column & action */}
            <Switch id="availability" defaultChecked={true} />
            <Label htmlFor="availability">Accepting New Jobs</Label>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming Jobs</CardTitle>
          <CardDescription>Your scheduled service appointments.</CardDescription>
        </CardHeader>
        <CardContent>
          {bookings && bookings.length > 0 ? (
            <div className="space-y-4">
              {bookings.map((booking: any) => (
                  <div key={booking.id} className="flex flex-col md:flex-row justify-between md:items-center p-4 border rounded-xl gap-6 bg-white hover:shadow-sm transition-shadow">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded border border-slate-200">
                          {booking.order_number || 'Processing'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between md:justify-start gap-4">
                        <h4 className="font-bold text-lg text-slate-900">
                          {booking.services && booking.services.length > 0 
                            ? booking.services.map((s: any) => s.service_name).join(', ')
                            : 'Service Request'}
                        </h4>
                        <span className="font-bold text-lg md:hidden text-indigo-600">
                          ₹150
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 mt-1 flex items-start gap-2">
                        <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                        <span className="leading-relaxed">{booking.service_address}</span>
                      </p>
                      <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                        📅 {new Date(booking.scheduled_time).toLocaleString('en-IN', {
                          weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </p>
                    </div>

                    <div className="flex flex-col items-stretch md:items-end gap-3 w-full md:w-auto shrink-0">
                      <div className="hidden md:flex items-center gap-3 justify-end w-full">
                        <span className="font-bold text-xl text-indigo-600">
                          ₹150 <span className="text-sm font-normal text-slate-500">(Inspection)</span>
                        </span>
                      </div>
                      
                      <div className="flex justify-end mb-2">
                        <StatusBadge status={booking.status} />
                      </div>

                      {/* Fulfillment Controls */}
                      {(booking.status === 'pending' || booking.status === 'vendor_assigned') && (
                        <form action={async () => { "use server"; await updateBookingStatus(booking.id, 'in_transit') }} className="w-full">
                          <Button type="submit" size="lg" className="w-full bg-indigo-600 hover:bg-indigo-700 text-base font-semibold gap-2">
                            <Truck className="w-5 h-5" /> Mark as In Transit
                          </Button>
                        </form>
                      )}

                      {booking.status === 'in_transit' && (
                        <div className="flex flex-col gap-2 w-full">
                          <a 
                            href={`https://www.google.com/maps/dir/?api=1&destination=${
                              booking.customer_latitude && booking.customer_longitude
                                ? `${booking.customer_latitude},${booking.customer_longitude}`
                                : encodeURIComponent(
                                    booking.service_address.toLowerCase().includes('chennai') 
                                      ? booking.service_address 
                                      : `${booking.service_address}, Chennai, Tamil Nadu`
                                  )
                            }`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full bg-amber-500 hover:bg-amber-600 text-white text-base font-semibold gap-2 inline-flex items-center justify-center rounded-md h-11 px-8"
                          >
                            <MapPin className="w-5 h-5" /> Navigate to Customer
                          </a>
                          {booking.customer_phone && (
                            <a 
                              href={`tel:${booking.customer_phone}`}
                              className="w-full bg-slate-800 hover:bg-slate-900 text-white text-base font-semibold gap-2 inline-flex items-center justify-center rounded-md h-11 px-8"
                            >
                              📞 Call Customer
                            </a>
                          )}
                          {booking.quote_status === 'pending' || !booking.quote_status ? (
                            <form action={async (formData) => {
                              "use server";
                              await provideFinalQuote(formData);
                            }} className="w-full flex flex-col gap-2 p-3 bg-slate-50 border rounded-lg mt-2">
                              <Label className="text-sm font-bold text-slate-700">Provide Final Quote (₹)</Label>
                              <div className="flex gap-2">
                                <input type="hidden" name="bookingId" value={booking.id} />
                                <Input type="number" name="quotePrice" placeholder="e.g. 1500" required className="bg-white" />
                                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white shrink-0">Send Quote</Button>
                              </div>
                            </form>
                          ) : booking.quote_status === 'provided' ? (
                            <div className="w-full p-3 bg-amber-50 border border-amber-200 text-amber-800 text-center rounded-lg text-sm font-semibold">
                              Waiting for customer approval...
                            </div>
                          ) : (
                            <form action={async () => { "use server"; await updateBookingStatus(booking.id, 'completed') }} className="w-full">
                              <Button type="submit" size="lg" className="w-full bg-emerald-600 hover:bg-emerald-700 text-base font-semibold gap-2">
                                <CheckCircle className="w-5 h-5" /> Mark as Completed
                              </Button>
                            </form>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-md text-slate-500">
              <p>You have no upcoming appointments.</p>
              <p className="text-sm mt-1">New booking requests will appear here once customers schedule a service.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

export default function VendorDashboard() {
  return (
    <div className="space-y-6 max-w-5xl">
      <Suspense fallback={<LoadingSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  )
}
