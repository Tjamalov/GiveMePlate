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
        this.supabase = null;
        this.cache = {
            allPlaces: null,
            vibes: null,
            vibePlaces: {}
        };
        this.initializeSupabase();
    }

    initializeSupabase() {
        this.supabase = initializeSupabase();
    }

    async getUniqueVibes() {
        console.log('Fetching unique vibes...');
        
        // Проверяем кэш
        if (this.cache.vibes) {
            console.log('Using cached vibes');
            return this.cache.vibes;
        }

        try {
            const { data, error } = await this.supabase
                .from('places')
                .select('vibe')
                .not('vibe', 'is', null)
                .order('vibe');

            if (error) throw error;

            const uniqueVibes = [...new Set(data.map(item => item.vibe))];
            console.log('Unique vibes:', uniqueVibes);
            
            // Кэшируем результаты
            this.cache.vibes = uniqueVibes;
            
            return uniqueVibes;
        } catch (error) {
            console.error('Error in getUniqueVibes:', error);
            throw error;
        }
    }

    async searchPlacesByVibe(vibe) {
        try {
            console.log('Searching places by vibe:', vibe);
            
            // Проверяем, что vibe не пустой
            if (!vibe || typeof vibe !== 'string') {
                throw new Error('Invalid vibe parameter');
            }

            // Используем прямой запрос к таблице places
            const { data: places, error } = await this.supabase
                .from('places')
                .select('*')
                .ilike('vibe', vibe);

            if (error) {
                console.error('Supabase error:', error);
                throw new Error(error.message || 'Ошибка при поиске мест');
            }

            if (!places || !Array.isArray(places)) {
                console.error('Invalid response from Supabase:', places);
                throw new Error('Некорректный ответ от сервера');
            }

            console.log('Found places:', places);
            return places;
        } catch (error) {
            console.error('Error in searchPlacesByVibe:', error);
            throw error;
        }
    }

    async searchPlaces(latitude, longitude, radius = 1000, dbRadius = 30000, limit = 1000) {
        console.log('Starting searchPlaces...');
        
        // Проверяем кэш
        if (this.cache.allPlaces) {
            console.log('Using cached places');
            return this.cache.allPlaces;
        }

        console.log('Using PostGIS with parameters:', { latitude, longitude, radius, dbRadius, limit });
        
        try {
            console.log('Executing Supabase query with PostGIS...');
            const { data, error } = await this.supabase
                .rpc('search_places', {
                    p_lat: latitude,
                    p_lon: longitude,
                    p_radius: dbRadius,
                    p_limit: limit
                });

            if (error) throw error;

            console.log('PostGIS search results:', {
                totalPlaces: data.length,
                nearbyPlaces: data.filter(p => p.distance <= radius).length,
                farPlaces: data.filter(p => p.distance > radius).length,
                places: data
            });

            // Кэшируем результаты
            this.cache.allPlaces = data;
            
            return data;
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

    clearCache() {
        console.log('Clearing database cache');
        this.cache = {
            allPlaces: null,
            vibes: null,
            vibePlaces: {}
        };
    }
}

// Export the database class
window.PlacesDatabase = PlacesDatabase; 