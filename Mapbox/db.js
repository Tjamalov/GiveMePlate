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

    async searchPlaces(latitude, longitude, radius = 1000) {
        console.log('Starting searchPlaces...');
        console.log('Input parameters:', { latitude, longitude, radius });
        
        try {
            console.log('Executing Supabase query...');
            
            // Сначала проверим структуру таблицы
            const { data: tableStructure, error: structureError } = await this.supabase
                .from('places')
                .select('*')
                .limit(1);
            
            console.log('Table structure check:', {
                hasData: !!tableStructure,
                structureError,
                firstRow: tableStructure?.[0]
            });

            if (structureError) {
                console.error('Error checking table structure:', structureError);
                throw structureError;
            }

            // Теперь получим данные
            const { data, error, count } = await this.supabase
                .from('places')
                .select('*', { count: 'exact' })
                .limit(10);

            console.log('Query result:', {
                data,
                error,
                count,
                hasData: !!data,
                dataLength: data?.length
            });

            if (error) {
                console.error('Supabase query error:', error);
                throw error;
            }

            if (!data || data.length === 0) {
                console.warn('No data returned from places table');
                // Добавим тестовые данные, если таблица пуста
                await this.addTestData();
                // Повторим запрос после добавления тестовых данных
                const { data: newData } = await this.supabase
                    .from('places')
                    .select('*')
                    .limit(10);
                return newData || [];
            }

            return data;
        } catch (error) {
            console.error('Error in searchPlaces:', error);
            throw error;
        }
    }

    async addTestData() {
        console.log('Adding test data...');
        const testPlaces = [
            {
                name: 'Тестовое кафе',
                type: 'cafe',
                address: 'ул. Тестовая, 1',
                location: {
                    type: 'Point',
                    coordinates: [20.485837, 54.953514]
                }
            },
            {
                name: 'Тестовый ресторан',
                type: 'restaurant',
                address: 'ул. Тестовая, 2',
                location: {
                    type: 'Point',
                    coordinates: [20.486837, 54.954514]
                }
            }
        ];

        try {
            const { data, error } = await this.supabase
                .from('places')
                .insert(testPlaces)
                .select();

            if (error) {
                console.error('Error adding test data:', error);
                throw error;
            }

            console.log('Test data added successfully:', data);
            return data;
        } catch (error) {
            console.error('Error in addTestData:', error);
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