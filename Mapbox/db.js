// Initialize Supabase client
let supabaseClient = null;

function initializeSupabase() {
    console.log('Initializing Supabase client...');
    console.log('Supabase URL:', window.SUPABASE_URL);
    console.log('Supabase Key:', window.SUPABASE_KEY ? 'Key is set' : 'Key is missing');
    
    if (!supabaseClient) {
        try {
            supabaseClient = supabase.createClient(
                window.SUPABASE_URL,
                window.SUPABASE_KEY
            );
            console.log('Supabase client initialized successfully');
        } catch (error) {
            console.error('Error initializing Supabase client:', error);
            throw error;
        }
    }
    return supabaseClient;
}

class PlacesDatabase {
    constructor() {
        console.log('Creating PlacesDatabase instance...');
        this.supabase = initializeSupabase();
    }

    async getUniqueVibes() {
        console.log('Fetching unique vibes...');
        try {
            const { data, error } = await this.supabase
                .from('places')
                .select('vibe')
                .not('vibe', 'is', null)
                .order('vibe');

            if (error) throw error;

            // Get unique vibes and filter out null/empty values
            const uniqueVibes = [...new Set(data.map(place => place.vibe).filter(Boolean))];
            console.log('Unique vibes:', uniqueVibes);
            return uniqueVibes;
        } catch (error) {
            console.error('Error fetching unique vibes:', error);
            throw error;
        }
    }

    async searchPlacesByVibe(vibe, latitude, longitude, radius = 1000, limit = 1000) {
        console.log('Searching places by vibe:', vibe);
        // Используем больший радиус для поиска в базе
        const dbRadius = 30000; // 30 км
        console.log('Using PostGIS with parameters:', {
            vibe,
            latitude,
            longitude,
            radius,
            dbRadius,
            limit,
            point: `POINT(${longitude} ${latitude})`,
            distance: `${radius} meters (client) / ${dbRadius} meters (db)`
        });
        
        try {
            const { data, error } = await this.supabase
                .rpc('search_places_by_vibe', {
                    p_vibe: vibe,
                    p_lat: latitude,
                    p_lon: longitude,
                    p_radius: dbRadius,
                    p_limit: limit
                });

            if (error) throw error;
            
            // Фильтруем результаты на клиенте
            const filteredData = data.map(place => ({
                ...place,
                distance: this.calculateDistance(
                    latitude,
                    longitude,
                    place.location.coordinates[1],
                    place.location.coordinates[0]
                )
            }));

            console.log('PostGIS search results:', {
                totalPlaces: filteredData?.length,
                nearbyPlaces: filteredData?.filter(p => p.distance <= radius).length,
                farPlaces: filteredData?.filter(p => p.distance > radius).length,
                places: filteredData?.map(p => ({
                    name: p.name,
                    distance: p.distance,
                    coordinates: p.location?.coordinates,
                    location: p.location,
                    geometry: p.location?.type,
                    srid: p.location?.srid
                }))
            });
            
            return filteredData || [];
        } catch (error) {
            console.error('Error searching places by vibe:', error);
            throw error;
        }
    }

    async searchPlaces(latitude, longitude, radius = 1000, limit = 1000) {
        console.log('Starting searchPlaces...');
        // Используем больший радиус для поиска в базе
        const dbRadius = 30000; // 30 км
        console.log('Using PostGIS with parameters:', {
            latitude,
            longitude,
            radius,
            dbRadius,
            limit,
            point: `POINT(${longitude} ${latitude})`,
            distance: `${radius} meters (client) / ${dbRadius} meters (db)`
        });
        
        try {
            console.log('Executing Supabase query with PostGIS...');
            
            const { data, error, count } = await this.supabase
                .rpc('search_places', {
                    p_lat: latitude,
                    p_lon: longitude,
                    p_radius: dbRadius,
                    p_limit: limit
                });

            // Фильтруем результаты на клиенте
            const filteredData = data.map(place => ({
                ...place,
                distance: this.calculateDistance(
                    latitude,
                    longitude,
                    place.location.coordinates[1],
                    place.location.coordinates[0]
                )
            }));

            console.log('PostGIS search results:', {
                totalPlaces: filteredData?.length,
                nearbyPlaces: filteredData?.filter(p => p.distance <= radius).length,
                farPlaces: filteredData?.filter(p => p.distance > radius).length,
                places: filteredData?.map(p => ({
                    name: p.name,
                    distance: p.distance,
                    coordinates: p.location?.coordinates,
                    location: p.location,
                    geometry: p.location?.type,
                    srid: p.location?.srid
                }))
            });

            if (error) {
                console.error('Supabase query error:', error);
                throw error;
            }

            if (!filteredData || filteredData.length === 0) {
                console.warn('No data returned from places table');
                return [];
            }

            const distances = filteredData.map(p => p.distance);
            console.log('Distances calculated by PostGIS:', {
                min: Math.min(...distances),
                max: Math.max(...distances),
                avg: distances.reduce((a, b) => a + b, 0) / distances.length
            });

            return filteredData;
        } catch (error) {
            console.error('Error in searchPlaces:', error);
            throw error;
        }
    }

    // Вспомогательная функция для расчета расстояния
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI/180;
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return Math.round(R * c); // Distance in meters
    }

    async getPlaceDetails(placeId) {
        try {
            const { data, error } = await this.supabase
                .from('places')
                .select('*')
                .eq('id', placeId)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting place details:', error);
            throw error;
        }
    }

    async getPlacePhotos(placeId) {
        try {
            const { data, error } = await this.supabase
                .from('place_photos')
                .select('*')
                .eq('place_id', placeId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting place photos:', error);
            throw error;
        }
    }

    async getPlaceReviews(placeId) {
        try {
            const { data, error } = await this.supabase
                .from('reviews')
                .select('*')
                .eq('place_id', placeId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error getting place reviews:', error);
            throw error;
        }
    }
}

// Export the database class
window.PlacesDatabase = PlacesDatabase; 