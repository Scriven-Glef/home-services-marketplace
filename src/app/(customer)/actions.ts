'use server'

import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { getDrivingEtaMins } from '@/lib/googleMaps';
import { cookies } from 'next/headers';

import { getSessionUserId } from '@/lib/auth';

export async function checkAndSetPincode(rawPincode: string) {
  const pincode = rawPincode.trim();
  console.log(`[Validation] Checking pincode: '${pincode}'`);

  // Query 1: Get all vendor profiles covering this pincode
  const { data: vendorAreas, error: areaError } = await supabase
    .from('vendor_service_areas')
    .select('vendor_profile_id')
    .eq('pincode', pincode);

  if (areaError) {
    console.error(`[Validation] Area query error:`, areaError);
    return { error: "We don't currently serve this area. Please try another pincode." };
  }

  if (!vendorAreas || vendorAreas.length === 0) {
    console.log(`[Validation] No vendor areas found for pincode: '${pincode}'`);
    return { error: "We don't currently serve this area. Please try another pincode." };
  }

  const profileIds = vendorAreas.map(va => va.vendor_profile_id);
  console.log(`[Validation] Found vendor profiles in area:`, profileIds);

  // Query 2: Check if ANY of those vendors are approved
  const { data: approvedProfiles, error: profileError } = await supabase
    .from('vendor_profiles')
    .select('id, onboarding_status')
    .in('id', profileIds)
    .eq('onboarding_status', 'approved');

  if (profileError) {
    console.error(`[Validation] Profile query error:`, profileError);
    return { error: "We don't currently serve this area. Please try another pincode." };
  }

  if (!approvedProfiles || approvedProfiles.length === 0) {
    console.log(`[Validation] None of the vendors in area are approved.`);
    // Debug: fetch what they actually are to see if they are pending
    const { data: debugProfiles } = await supabase.from('vendor_profiles').select('id, onboarding_status').in('id', profileIds);
    console.log(`[Validation Debug] Actual vendor statuses:`, debugProfiles);
    return { error: "We don't currently serve this area. Please try another pincode." };
  }

  console.log(`[Validation] Success! Found approved vendors:`, approvedProfiles);
  const cookieStore = await cookies();
  cookieStore.set('customer_pincode', pincode, { maxAge: 60 * 60 * 24 * 7 }); // 7 days

  return { success: true };
}

export async function searchServicesByPincode(pincode: string) {
  // Find all master_service IDs offered by approved vendors covering this pincode
  const { data: vendorAreas, error: areaError } = await supabase
    .from('vendor_service_areas')
    .select('vendor_profile_id')
    .eq('pincode', pincode);

  if (areaError || !vendorAreas || vendorAreas.length === 0) {
    return [];
  }

  const vendorProfileIds = vendorAreas.map((va: any) => va.vendor_profile_id);

  // Only get vendors that are approved
  const { data: approvedProfiles, error: profileError } = await supabase
    .from('vendor_profiles')
    .select('id')
    .in('id', vendorProfileIds)
    .eq('onboarding_status', 'approved');

  if (profileError || !approvedProfiles || approvedProfiles.length === 0) {
    return [];
  }

  const approvedIds = approvedProfiles.map((p: any) => p.id);

  // Get the distinct master services offered by these approved vendors
  const { data: vendorServices, error: vsError } = await supabase
    .from('vendor_services')
    .select('master_service_id, master_service:master_services(*)')
    .in('vendor_profile_id', approvedIds)
    .eq('is_available', true);

  if (vsError || !vendorServices) {
    return [];
  }

  // Deduplicate by master_service_id
  const seen = new Set();
  const uniqueServices = vendorServices.filter((vs: any) => {
    if (seen.has(vs.master_service_id)) return false;
    seen.add(vs.master_service_id);
    return true;
  });

  return uniqueServices.map((vs: any) => vs.master_service);
}

export async function getVendorsForService(masterServiceId: string, pincode: string) {
  // 1. Find vendor_profile_ids covering the pincode
  const { data: vendorAreas } = await supabase
    .from('vendor_service_areas')
    .select('vendor_profile_id')
    .eq('pincode', pincode);

  if (!vendorAreas || vendorAreas.length === 0) return [];

  const vendorProfileIds = vendorAreas.map((va: any) => va.vendor_profile_id);

  // 2. Get approved vendors who offer this service AND cover this pincode
  const { data: vendorServices, error } = await supabase
    .from('vendor_services')
    .select(`
      id,
      price,
      is_available,
      vendor_profile:vendor_profiles!inner(
        id,
        business_name,
        onboarding_status,
        users:user_id(name, phone)
      )
    `)
    .eq('master_service_id', masterServiceId)
    .in('vendor_profile_id', vendorProfileIds)
    .eq('is_available', true)
    .eq('vendor_profiles.onboarding_status', 'approved');

  if (error) {
    console.error('Error fetching vendors for service:', error);
    return [];
  }

  return vendorServices || [];
}

export async function getServiceById(serviceId: string) {
  const { data, error } = await supabase
    .from('master_services')
    .select('*')
    .eq('id', serviceId)
    .single();

  if (error) return null;
  return data;
}

export async function createBooking(formData: FormData) {
  const CUSTOMER_ID = await getSessionUserId();
  if (!CUSTOMER_ID) throw new Error('Unauthenticated');

  const catalogServiceIdsStr = formData.get('catalogServiceIds') as string;
  const serviceAddress = formData.get('serviceAddress') as string;
  const customerPhone = formData.get('customerPhone') as string;
  const customerName = formData.get('customerName') as string;
  const pincode = formData.get('pincode') as string;
  const customerLatitude = formData.get('customerLatitude') as string;
  const customerLongitude = formData.get('customerLongitude') as string;
  const isAsap = formData.get('isAsap') === 'true';
  let scheduledTime = formData.get('scheduledTime') as string;
  const vendorProfileId = formData.get('vendorProfileId') as string;

  if (isAsap) {
    scheduledTime = new Date().toISOString();
  }

  let catalogServiceIds = [];
  try {
    catalogServiceIds = JSON.parse(catalogServiceIdsStr);
  } catch(e) {}

  const estimatedLogisticsTimeMins = 30; // Pending vendor assignment

  // We need the user_id of the vendor to insert into bookings table
  let vendorUserId = null;
  if (vendorProfileId) {
    const { data: profile } = await supabase
      .from('vendor_profiles')
      .select('user_id')
      .eq('id', vendorProfileId)
      .single();
    if (profile) vendorUserId = profile.user_id;
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      customer_id: CUSTOMER_ID,
      vendor_id: vendorUserId,
      service_address: serviceAddress,
      customer_phone: customerPhone,
      customer_name: customerName,
      scheduled_time: scheduledTime,
      estimated_logistics_time_mins: estimatedLogisticsTimeMins,
      status: 'pending',
      catalog_service_ids: catalogServiceIds,
      pincode,
      customer_latitude: customerLatitude ? parseFloat(customerLatitude) : null,
      customer_longitude: customerLongitude ? parseFloat(customerLongitude) : null
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating booking:', error);
    return { error: 'Failed to create booking. Please try again.' };
  }

  revalidatePath('/bookings');
  revalidatePath('/vendor'); // Invalidate Vendor Command Centre
  revalidatePath('/admin', 'layout'); // Invalidate Admin Command Centre
  return { success: true, estimatedLogisticsTimeMins, bookingId: data.id };
}

export async function getCustomerBookings() {
  const CUSTOMER_ID = await getSessionUserId();
  if (!CUSTOMER_ID) return [];

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      id,
      status,
      service_address,
      scheduled_time,
      estimated_logistics_time_mins,
      created_at,
      catalog_service_ids,
      final_quoted_price,
      quote_status,
      order_number,
      vendor:users!bookings_vendor_id_fkey(name)
    `)
    .eq('customer_id', CUSTOMER_ID)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !bookings) {
    console.error('Error fetching customer bookings:', error);
    return [];
  }

  // Fetch the catalog items manually since it's an array of UUIDs
  const allCatalogIds = new Set<string>();
  bookings.forEach(b => {
    if (b.catalog_service_ids) {
      b.catalog_service_ids.forEach((id: string) => allCatalogIds.add(id));
    }
  });

  let catalogMap: Record<string, any> = {};
  if (allCatalogIds.size > 0) {
    const { data: catalogItems } = await supabase
      .from('service_catalog')
      .select('id, service_name, base_price, category')
      .in('id', Array.from(allCatalogIds));
      
    if (catalogItems) {
      catalogItems.forEach(item => {
        catalogMap[item.id] = item;
      });
    }
  }

  return bookings.map(b => {
    const services = (b.catalog_service_ids || []).map((id: string) => catalogMap[id]).filter(Boolean);
    return {
      ...b,
      services
    };
  });
}

export async function getAvailableVendors(pincode: string, serviceIds: string[]) {
  const cleanPincode = pincode.trim();
  
  // Step 1: Query 1 (Location)
  const { data: vendorAreas } = await supabase
    .from('vendor_service_areas')
    .select('vendor_profile_id')
    .eq('pincode', cleanPincode);
    
  if (!vendorAreas || vendorAreas.length === 0) return [];
  const locationIds = vendorAreas.map(va => va.vendor_profile_id);

  let intersectedIds = locationIds;
  
  if (serviceIds.length > 0) {
    // Step 2: Query 2 (Services)
    const { data: vendorServices } = await supabase
      .from('vendor_services')
      .select('vendor_profile_id, catalog_service_id')
      .in('catalog_service_id', serviceIds)
      .eq('is_available', true);

    if (!vendorServices || vendorServices.length === 0) return [];

    // Group by vendor and use a Set to ensure strict uniqueness 
    const uniqueServiceIdsCount = new Set(serviceIds).size;
    const vendorServiceSets: Record<string, Set<string>> = {};
    
    vendorServices.forEach(vs => {
      if (!vendorServiceSets[vs.vendor_profile_id]) {
        vendorServiceSets[vs.vendor_profile_id] = new Set();
      }
      vendorServiceSets[vs.vendor_profile_id].add(vs.catalog_service_id);
    });

    const serviceMatchedIds = Object.keys(vendorServiceSets).filter(
      vid => vendorServiceSets[vid].size === uniqueServiceIdsCount
    );

    if (serviceMatchedIds.length === 0) return [];

    // Step 3: Intersection
    intersectedIds = locationIds.filter(id => serviceMatchedIds.includes(id));
  }
  
  if (intersectedIds.length === 0) return [];

  // Step 4: Final Fetch
  const { data: approvedProfiles } = await supabase
    .from('vendor_profiles')
    .select('id, business_name, user_id')
    .in('id', intersectedIds)
    .eq('onboarding_status', 'approved');
    
  if (!approvedProfiles || approvedProfiles.length === 0) return [];

  const finalIds = approvedProfiles.map(p => p.id);

  // 5. Fetch ratings
  const { data: reviews } = await supabase
    .from('reviews')
    .select('vendor_profile_id, rating')
    .in('vendor_profile_id', finalIds);

  const ratingsMap: Record<string, { sum: number, count: number }> = {};
  if (reviews) {
    reviews.forEach(r => {
      if (!ratingsMap[r.vendor_profile_id]) {
        ratingsMap[r.vendor_profile_id] = { sum: 0, count: 0 };
      }
      ratingsMap[r.vendor_profile_id].sum += r.rating;
      ratingsMap[r.vendor_profile_id].count += 1;
    });
  }

  // Compile final result
  return approvedProfiles.map(profile => {
    const rData = ratingsMap[profile.id];
    let ratingStr = "New";
    if (rData && rData.count > 0) {
      ratingStr = (rData.sum / rData.count).toFixed(1);
    }
    return {
      id: profile.id,
      businessName: profile.business_name,
      userId: profile.user_id,
      rating: ratingStr,
      reviewCount: rData ? rData.count : 0
    };
  });
}

// -----------------------------------------------------------------------------
// NEW: Customer Saved Addresses
// -----------------------------------------------------------------------------

export async function saveCustomerAddress(formData: FormData) {
  const CUSTOMER_ID = await getSessionUserId();
  if (!CUSTOMER_ID) throw new Error('Unauthenticated');

  const name = formData.get('name') as string;
  const phone = formData.get('phone') as string;
  const addressLine1 = formData.get('addressLine1') as string;
  const addressLine2 = formData.get('addressLine2') as string;
  const pincode = formData.get('pincode') as string;
  const latitude = formData.get('latitude') as string;
  const longitude = formData.get('longitude') as string;
  
  if (!name || !phone || !addressLine1 || !pincode || !latitude || !longitude) {
    return { error: 'Please fill in all required fields and pin your location.' };
  }

  const { error } = await supabase
    .from('customer_addresses')
    .insert({
      user_id: CUSTOMER_ID,
      name,
      phone,
      address_line1: addressLine1,
      address_line2: addressLine2 || null,
      pincode,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      is_default: false
    });

  if (error) {
    console.error('Error saving address:', error);
    return { error: 'Failed to save address.' };
  }

  revalidatePath('/account');
  revalidatePath('/checkout');
  revalidatePath('/', 'layout');
  return { success: true };
}

export async function getCustomerAddresses() {
  const CUSTOMER_ID = await getSessionUserId();
  if (!CUSTOMER_ID) return [];

  const { data, error } = await supabase
    .from('customer_addresses')
    .select('*')
    .eq('user_id', CUSTOMER_ID)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching addresses:', error);
    return [];
  }
  return data || [];
}

export async function updateCustomerAddress(formData: FormData) {
  const userId = await getSessionUserId();
  if (!userId) throw new Error('Unauthenticated');


  const id = formData.get('id') as string;
  const name = formData.get('name') as string;
  const phone = formData.get('phone') as string;
  const addressLine1 = formData.get('addressLine1') as string;
  const addressLine2 = formData.get('addressLine2') as string;
  const pincode = formData.get('pincode') as string;
  const latitude = formData.get('latitude') as string;
  const longitude = formData.get('longitude') as string;
  
  if (!id || !name || !phone || !addressLine1 || !pincode || !latitude || !longitude) {
    return { error: 'Please fill in all required fields and pin your location.' };
  }

  const { error } = await supabase
    .from('customer_addresses')
    .update({
      name,
      phone,
      address_line1: addressLine1,
      address_line2: addressLine2 || null,
      pincode,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude)
    })
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.error('Error updating address:', error);
    return { error: 'Failed to update address.' };
  }

  revalidatePath('/account');
  revalidatePath('/checkout');
  revalidatePath('/', 'layout');
  return { success: true };
}

export async function deleteCustomerAddress(id: string) {
  const userId = await getSessionUserId();
  if (!userId) throw new Error('Unauthenticated');


  const { error } = await supabase
    .from('customer_addresses')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting address:', error);
    return { error: 'Failed to delete address.' };
  }

  revalidatePath('/account');
  revalidatePath('/checkout');
  revalidatePath('/', 'layout');
  return { success: true };
}

export async function respondToQuote(bookingId: string, status: 'approved' | 'declined') {
  const userId = await getSessionUserId();
  if (!userId) throw new Error('Unauthenticated');


  const { error } = await supabase
    .from('bookings')
    .update({ quote_status: status })
    .eq('id', bookingId)
    .eq('customer_id', userId);

  if (error) {
    console.error('Error updating quote response:', error);
    return { error: error.message };
  }

  revalidatePath('/bookings');
  revalidatePath('/vendor');
  revalidatePath('/admin', 'layout');
  revalidatePath('/admin/bookings');
  return { success: true };
}
