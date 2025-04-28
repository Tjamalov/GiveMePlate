// Initialize Supabase client
const supabase = supabase.createClient(
    window.SUPABASE_URL,
    window.SUPABASE_KEY
);

class PlacesDatabase {
    constructor() {
        this.supabase = supabase;
    }

    async searchPlaces(latitude, longitude, radius = 1000) {
        try {
            // Query places within radius using PostGIS
            const { data, error } = await this.supabase
                .from('places')
                .select('*')
                .filter('location', 'st_dwithin', {
                    point: `POINT(${longitude} ${latitude})`,
                    distance: radius
                })
                .order('distance', { ascending: true });

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error searching places:', error);
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