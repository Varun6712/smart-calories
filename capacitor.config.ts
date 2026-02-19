import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.smartcalories.app',
    appName: 'SmartCalories',
    webDir: 'dist',
    server: {
        androidScheme: 'https',
        allowNavigation: ['generativelanguage.googleapis.com']
    },
    plugins: {
        CapacitorHttp: {
            enabled: true,
        },
    },
};

export default config;
