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

    async searchPlacesByVibe(vibe, latitude, longitude, radius = 1000) {
        console.log('Searching places by vibe:', vibe);
        try {
            const { data, error } = await this.supabase
                .from('places')
                .select('*')
                .eq('vibe', vibe)
                .filter('location', 'dwithin', `POINT(${longitude} ${latitude})`, radius)
                .order('location <->', `POINT(${longitude} ${latitude})`)
                .limit(50);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error searching places by vibe:', error);
            throw error;
        }
    }

    async searchPlaces(latitude, longitude, radius = 1000) {
        console.log('Starting searchPlaces...');
        console.log('Input parameters:', { latitude, longitude, radius });
        
        try {
            console.log('Executing Supabase query with PostGIS...');
            
            // Используем PostGIS для поиска мест в радиусе
            const { data, error, count } = await this.supabase
                .from('places')
                .select('*', { count: 'exact' })
                .filter('location', 'dwithin', `POINT(${longitude} ${latitude})`, radius)
                .order('location <->', `POINT(${longitude} ${latitude})`)
                .limit(50);

            console.log('Query result:', {
                data,
                error,
                count,
                hasData: !!data,
                dataLength: data?.length,
                allPlaces: data?.map(p => ({ id: p.id, name: p.name }))
            });

            if (error) {
                console.error('Supabase query error:', error);
                throw error;
            }

            if (!data || data.length === 0) {
                console.warn('No data returned from places table');
                return [];
            }

            return data;
        } catch (error) {
            console.error('Error in searchPlaces:', error);
            throw error;
        }
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