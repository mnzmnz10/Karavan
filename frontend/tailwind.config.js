/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: [
        "./src/**/*.{js,jsx,ts,tsx}",
        "./public/index.html"
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Public Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
                display: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif']
            },
            borderRadius: {
                lg: 'var(--radius)',
                md: 'calc(var(--radius) - 2px)',
                sm: 'calc(var(--radius) - 4px)'
            },
            colors: {
                background: 'hsl(var(--background))',
                foreground: 'hsl(var(--foreground))',
                emerald: {
                    50: '#f4f9f4',
                    100: '#e8f3e8',
                    200: '#c5e2c5',
                    300: '#94cb94',
                    400: '#5da75d',
                    500: '#2d6a4f',
                    600: '#1b4332',
                    700: '#143225',
                    800: '#0d2119',
                    900: '#08140f',
                },
                green: {
                    50: '#f4f9f4',
                    100: '#e8f3e8',
                    200: '#c5e2c5',
                    300: '#94cb94',
                    400: '#5da75d',
                    500: '#2d6a4f',
                    600: '#1b4332',
                    700: '#143225',
                    800: '#0d2119',
                    900: '#08140f',
                },
                blue: {
                    50: '#faf5f0',
                    100: '#f7ebe1',
                    200: '#edd3c1',
                    300: '#e2b49b',
                    400: '#cf8867',
                    500: '#ca6a45',
                    600: '#b85c38',
                    700: '#98492c',
                    800: '#7b3c25',
                    900: '#64321f',
                },
                indigo: {
                    50: '#fffbeb',
                    100: '#fef3c7',
                    200: '#fde68a',
                    300: '#fcd34d',
                    400: '#fbbf24',
                    500: '#f59e0b',
                    600: '#d97706',
                    700: '#b45309',
                    800: '#92400e',
                    900: '#78350f',
                },
                card: {
                    DEFAULT: 'hsl(var(--card))',
                    foreground: 'hsl(var(--card-foreground))'
                },
                popover: {
                    DEFAULT: 'hsl(var(--popover))',
                    foreground: 'hsl(var(--popover-foreground))'
                },
                primary: {
                    DEFAULT: 'hsl(var(--primary))',
                    foreground: 'hsl(var(--primary-foreground))'
                },
                secondary: {
                    DEFAULT: 'hsl(var(--secondary))',
                    foreground: 'hsl(var(--secondary-foreground))'
                },
                muted: {
                    DEFAULT: 'hsl(var(--muted))',
                    foreground: 'hsl(var(--muted-foreground))'
                },
                accent: {
                    DEFAULT: 'hsl(var(--accent))',
                    foreground: 'hsl(var(--accent-foreground))'
                },
                destructive: {
                    DEFAULT: 'hsl(var(--destructive))',
                    foreground: 'hsl(var(--destructive-foreground))'
                },
                border: 'hsl(var(--border))',
                input: 'hsl(var(--input))',
                ring: 'hsl(var(--ring))',
                chart: {
                    '1': 'hsl(var(--chart-1))',
                    '2': 'hsl(var(--chart-2))',
                    '3': 'hsl(var(--chart-3))',
                    '4': 'hsl(var(--chart-4))',
                    '5': 'hsl(var(--chart-5))'
                }
            },
            keyframes: {
                'accordion-down': {
                    from: {
                        height: '0'
                    },
                    to: {
                        height: 'var(--radix-accordion-content-height)'
                    }
                },
                'accordion-up': {
                    from: {
                        height: 'var(--radix-accordion-content-height)'
                    },
                    to: {
                        height: '0'
                    }
                }
            },
            animation: {
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out'
            }
        }
    },
    plugins: [require("tailwindcss-animate")],
    // Production optimizations
    ...(process.env.NODE_ENV === 'production' && {
        purge: {
            enabled: true,
            content: [
                './src/**/*.{js,jsx,ts,tsx}',
                './public/index.html'
            ],
            options: {
                safelist: [
                    'bg-emerald-50', 'bg-emerald-100', 'bg-emerald-500', 'bg-emerald-600', 'bg-emerald-700',
                    'text-emerald-600', 'text-emerald-700', 'text-emerald-800', 'text-emerald-900',
                    'border-emerald-200', 'border-emerald-300', 'border-emerald-600',
                    'bg-blue-50', 'bg-blue-100', 'bg-blue-500', 'bg-blue-600', 'bg-blue-700',
                    'text-blue-600', 'text-blue-700', 'text-blue-800', 'text-blue-900',
                    'border-blue-200', 'border-blue-300', 'border-t-blue-500',
                    'hover:bg-emerald-700', 'hover:bg-blue-700',
                    // Animation classes
                    'animate-spin',
                    // Gradient classes used in the app
                    'bg-gradient-to-br', 'bg-gradient-to-r', 'from-slate-50', 'via-emerald-25', 'to-teal-50',
                    'from-emerald-50', 'to-teal-50', 'from-blue-50', 'to-indigo-50', 'from-indigo-50', 'to-blue-50',
                    'from-emerald-50', 'to-green-50', 'from-green-50', 'to-emerald-100', 'border-green-300',
                    'from-accent-200/50', 'via-secondary', 'to-accent/15', 'from-accent/15', 'to-accent/30', 'from-primary', 'to-primary/90'
                ]
            }
        }
    })
};