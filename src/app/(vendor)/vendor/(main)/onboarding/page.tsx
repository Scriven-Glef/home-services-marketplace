'use client'

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { registerVendor } from "../../actions"
import { useTransition, useState } from "react"
import { useRouter } from "next/navigation"
import { MapPicker } from "@/components/MapPicker"

export default function OnboardingPage() {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [location, setLocation] = useState<{ lat: number, lng: number } | null>({ lat: 13.0827, lng: 80.2707 })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    
    startTransition(async () => {
      setError(null)
      const res = await registerVendor(formData)
      if (res.error) {
        setError(res.error)
      } else {
        router.push('/vendor')
      }
    })
  }

  return (
    <div className="max-w-xl mx-auto py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Become a Vendor</CardTitle>
          <CardDescription>
            Join our platform to connect with customers in your area. Fill out your business details below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 bg-rose-50 text-rose-600 rounded-md text-sm">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Your Full Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" name="phone" type="tel" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="businessName">Business Name</Label>
              <Input id="businessName" name="businessName" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="document">Verification Document (PDF/Image)</Label>
              <Input id="document" name="document" type="file" required accept="image/*,.pdf" />
              <p className="text-xs text-slate-500">Upload your trade license or government ID.</p>
            </div>
            
            <div className="grid gap-2">
              <Label>Business Location</Label>
              <p className="text-xs text-slate-500 mb-1">Pinpoint your primary business location or dispatch center.</p>
              <MapPicker onLocationSelect={(lat, lng) => setLocation({ lat, lng })} />
              {location && (
                <>
                  <input type="hidden" name="latitude" value={location.lat} />
                  <input type="hidden" name="longitude" value={location.lng} />
                </>
              )}
            </div>

            <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 mt-4" disabled={isPending}>
              {isPending ? 'Submitting...' : 'Submit Application'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
