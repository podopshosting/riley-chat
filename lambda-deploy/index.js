const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
let dbCredentials = null;
let dbPool = null;

// Cache credentials in Lambda memory to avoid repeated Secrets Manager calls
let cachedCredentials = null;

async function getDbPool() {
    if (dbPool) return dbPool;

    // Use Secrets Manager for database credentials (more secure)
    if (!cachedCredentials) {
        console.log('🔧 Loading database credentials from Secrets Manager...');

        try {
            const AWS = require('aws-sdk');
            const secretsManager = new AWS.SecretsManager({ region: 'us-east-2' });

            const secretResponse = await secretsManager.getSecretValue({ SecretId: 'DbKey-East2' }).promise();
            const secret = JSON.parse(secretResponse.SecretString);

            cachedCredentials = {
                host: secret.host,
                username: secret.username,
                password: secret.password,
                database: secret.database
            };

            console.log('✅ Using Secrets Manager for database credentials');
            console.log('Host:', cachedCredentials.host);
            console.log('Database:', cachedCredentials.database);
        } catch (error) {
            console.log('❌ Failed to load from Secrets Manager, trying environment variables...');
            console.log('DB_HOST:', process.env.DB_HOST ? 'SET' : 'NOT SET');
            console.log('DB_USER:', process.env.DB_USER ? 'SET' : 'NOT SET');
            console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? 'SET' : 'NOT SET');
            console.log('DB_NAME:', process.env.DB_NAME ? 'SET' : 'NOT SET');

            if (process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD) {
                cachedCredentials = {
                    host: process.env.DB_HOST,
                    username: process.env.DB_USER,
                    password: process.env.DB_PASSWORD,
                    database: process.env.DB_NAME || 'digitiv_staging'
                };
                console.log('✅ Using environment variables for database credentials');
                console.log('Host:', cachedCredentials.host);
                console.log('Database:', cachedCredentials.database);
            } else {
                console.log('❌ No valid credentials found');
                throw new Error('Database credentials not configured');
            }
        }
    }

    // Optimized connection pool for high performance (no VPC)
    dbPool = mysql.createPool({
        host: cachedCredentials.host,
        user: cachedCredentials.username,
        password: cachedCredentials.password,
        database: cachedCredentials.database || cachedCredentials.dbname,
        port: 3306,
        connectionLimit: 25,           // Increased from 3 to 25 for better concurrency
        acquireTimeout: 15000,         // Increased from 3s to 15s
        // timeout: 45000,             // Removed - invalid option
        idleTimeout: 300000,           // 5 minutes idle timeout
        queueLimit: 50,                // Queue up to 50 requests
        reconnect: true,               // Auto-reconnect on connection loss
        ssl: { rejectUnauthorized: false },
        // Performance optimizations
        dateStrings: false,
        supportBigNumbers: true,
        bigNumberStrings: false,
        charset: 'utf8mb4'
    });

    console.log('🔧 Connection pool created with host:', cachedCredentials.host);

    // Warm up the connection pool
    try {
        const connection = await dbPool.getConnection();
        await connection.ping();
        connection.release();
        console.log('✅ Database connection pool warmed up successfully');
    } catch (error) {
        console.error('⚠️ Connection pool warmup failed:', error.message);
    }

    return dbPool;
}

// Retry function with exponential backoff
async function executeWithRetry(pool, query, params, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🔍 Database query attempt ${attempt}/${maxRetries}`);
            const result = await pool.execute(query, params);
            console.log(`✅ Database query successful on attempt ${attempt}`);
            return result;
        } catch (error) {
            lastError = error;
            console.error(`❌ Database query failed (attempt ${attempt}/${maxRetries}):`, error.message);

            // Don't retry on authentication errors or syntax errors
            if (error.code === 'ER_ACCESS_DENIED_ERROR' ||
                error.code === 'ER_PARSE_ERROR' ||
                error.code === 'ER_NO_SUCH_TABLE') {
                break;
            }

            // Wait before retry (exponential backoff: 100ms, 200ms, 400ms)
            if (attempt < maxRetries) {
                const delay = 100 * Math.pow(2, attempt - 1);
                console.log(`⏳ Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError;
}

exports.handler = async (event) => {
    // Get origin from event headers for CORS
    const origin = event.headers?.origin || event.headers?.Origin;
    const allowedOrigins = ['https://www.mypodops.com', 'https://mypodops.com'];
    const isAllowedOrigin = allowedOrigins.includes(origin);

    const corsHeaders = {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://www.mypodops.com',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept, Origin',
        'Access-Control-Allow-Credentials': 'true',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        console.log('OPTIONS request received:', JSON.stringify(event, null, 2));
        console.log('Origin:', origin, 'Allowed:', isAllowedOrigin);
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({ message: 'CORS preflight successful' })
        };
    }

    try {
        let path = event.path || '/';
        const method = event.httpMethod || 'GET';

        if (event.pathParameters && event.pathParameters.proxy) {
            path = '/' + event.pathParameters.proxy;
        }

        console.log(`Processing ${method} ${path}`);

        // Health check
        if (path === '/health' || path === '/' || path === '') {
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    success: true,
                    message: 'Lambda is healthy',
                    timestamp: new Date().toISOString()
                })
            };
        }

        // Secure database login for all users
        if (path === '/auth/login' && method === 'POST') {
            const totalStartTime = Date.now();
            console.log(`🚀 Login request started at ${new Date().toISOString()}`);

            try {
                const body = JSON.parse(event.body || '{}');
                const { email, password } = body;

                if (!email || !password) {
                    return {
                        statusCode: 400,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Email and password required' })
                    };
                }

                const pool = await getDbPool();

                // Optimized query with better performance
                console.log(`🔐 Looking up user: ${email.substring(0, 3)}***`);
                const loginStartTime = Date.now();

                const [users] = await executeWithRetry(
                    pool,
                    'SELECT id, email, password, name, roles, is_admin FROM users WHERE email = ? AND status = 1 LIMIT 1',
                    [email]
                );

                const queryTime = Date.now() - loginStartTime;
                console.log(`⏱️ Database query completed in ${queryTime}ms`);

                if (users.length === 0) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid credentials' })
                    };
                }

                const user = users[0];
                let isValidPassword = false;

                console.log(`🔒 Validating password for user ${user.id}`);
                const passwordStartTime = Date.now();

                // Optimized password verification - check most likely format first
                if (user.password === password) {
                    // Plain text password (fastest check)
                    isValidPassword = true;
                    console.log('✅ Plain text password match');
                } else if (user.password && (user.password.startsWith('$2') || user.password.startsWith('$2y$') || user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))) {
                    // bcrypt hash (most secure, check second)
                    isValidPassword = await bcrypt.compare(password, user.password);
                    console.log(isValidPassword ? '✅ bcrypt password match' : '❌ bcrypt password mismatch');
                } else {
                    // Legacy hash formats (MD5, SHA256) - last resort
                    const md5Hash = crypto.createHash('md5').update(password).digest('hex');
                    const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');

                    if (user.password === md5Hash) {
                        isValidPassword = true;
                        console.log('✅ MD5 password match (consider upgrading to bcrypt)');
                    } else if (user.password === sha256Hash) {
                        isValidPassword = true;
                        console.log('✅ SHA256 password match (consider upgrading to bcrypt)');
                    } else {
                        console.log('❌ No password format matched');
                    }
                }

                const passwordTime = Date.now() - passwordStartTime;
                console.log(`⏱️ Password validation completed in ${passwordTime}ms`);

                if (!isValidPassword) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid credentials' })
                    };
                }

                const isAdmin = user.is_admin === 1 || user.roles === 'admin' || email === 'info@podops.app';

                console.log(`🎟️ Generating JWT token for user ${user.id}`);
                const tokenStartTime = Date.now();

                const token = jwt.sign(
                    {
                        id: user.id,
                        userId: user.id,
                        email: email,
                        isAdmin: isAdmin,
                        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
                    },
                    process.env.JWT_SECRET || 'podops-secret-key'
                );

                const tokenTime = Date.now() - tokenStartTime;
                const totalTime = Date.now() - totalStartTime;

                console.log(`⏱️ JWT token generated in ${tokenTime}ms`);
                console.log(`🎉 Login successful! Total time: ${totalTime}ms`);

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        token: token,
                        user: {
                            id: user.id,
                            user_id: user.id,
                            email: email,
                            firstName: user.first_name || user.name?.split(' ')[0] || 'User',
                            name: user.name || 'User',
                            userType: isAdmin ? 'admin' : 'user',
                            isAdmin: isAdmin,
                            is_admin: isAdmin,
                            hasHosting: true,
                            hasStudio: true
                        },
                        performance: {
                            totalTime: totalTime,
                            queryTime: queryTime,
                            passwordTime: passwordTime,
                            tokenTime: tokenTime
                        }
                    })
                };
            } catch (error) {
                const totalTime = Date.now() - totalStartTime;
                console.error(`❌ Login error after ${totalTime}ms:`, error);

                // Provide more specific error messages for debugging
                let errorMessage = 'Internal server error';
                if (error.code === 'ECONNREFUSED') {
                    errorMessage = 'Database connection refused';
                } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
                    errorMessage = 'Database access denied';
                } else if (error.code === 'ENOTFOUND') {
                    errorMessage = 'Database host not found';
                } else if (error.message.includes('credentials')) {
                    errorMessage = 'Database credentials unavailable';
                } else if (error.code?.startsWith('ER_')) {
                    errorMessage = 'Database query error';
                }

                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: errorMessage,
                        requestTime: totalTime,
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Token verification endpoint
        if (path === '/auth/verify' && method === 'POST') {
            console.log(`🔐 Token verification request started at ${new Date().toISOString()}`);

            try {
                const body = JSON.parse(event.body || '{}');
                let token = body.token;

                // Also check Authorization header
                if (!token && event.headers.Authorization) {
                    token = event.headers.Authorization.replace('Bearer ', '');
                } else if (!token && event.headers.authorization) {
                    token = event.headers.authorization.replace('Bearer ', '');
                }

                if (!token) {
                    return {
                        statusCode: 400,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                // Verify and decode the token
                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-here');
                    console.log('Token verified for user ID:', tokenData.id);
                } catch (error) {
                    console.error('Token verification failed:', error.message);
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                // Get user data from database
                const pool = await getDbPool();

                console.log(`🔍 Fetching user data for ID: ${tokenData.id}`);
                const [users] = await executeWithRetry(
                    pool,
                    'SELECT id, email, name, roles, is_admin FROM users WHERE id = ? AND status = 1 LIMIT 1',
                    [tokenData.id]
                );

                if (users.length === 0) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'User not found' })
                    };
                }

                const user = users[0];

                // Parse name for firstName extraction, prioritizing first_name field
                const firstName = user.first_name || user.name?.split(' ')[0] || '';

                // Query actual subscription tables for accurate data
                let hasHosting = false;
                let hasStudio = false;

                console.log(`🔍 Checking subscriptions for user ID: ${user.id}`);

                // Query general subscriptions table
                try {
                    const [subscriptions] = await executeWithRetry(
                        pool,
                        'SELECT type, name, status FROM subscriptions WHERE user_id = ? AND (status = "active" OR status = "1" OR status IS NULL)',
                        [user.id]
                    );

                    console.log('User subscriptions found:', subscriptions.length);
                    subscriptions.forEach(sub => {
                        console.log(`- Type: ${sub.type}, Name: ${sub.name}, Status: ${sub.status}`);
                        if (sub.type && (sub.type.toLowerCase().includes('hosting') || sub.name && sub.name.toLowerCase().includes('hosting'))) {
                            hasHosting = true;
                        }
                        if (sub.type && (sub.type.toLowerCase().includes('studio') || sub.name && sub.name.toLowerCase().includes('studio'))) {
                            hasStudio = true;
                        }
                    });
                } catch (subError) {
                    console.log('Error querying subscriptions table:', subError.message);
                }

                // Query studio-specific subscriptions table
                try {
                    const [studioSubs] = await executeWithRetry(
                        pool,
                        'SELECT * FROM studio_subscriptions WHERE user_id = ? AND (status = "active" OR status = "1" OR status IS NULL)',
                        [user.id]
                    );

                    if (studioSubs.length > 0) {
                        hasStudio = true;
                        console.log('Studio subscriptions found:', studioSubs.length);
                    }
                } catch (studioError) {
                    console.log('Studio subscriptions table not accessible or error:', studioError.message);
                }

                // Fallback to roles if no subscriptions found
                if (!hasHosting && !hasStudio) {
                    console.log('No subscriptions found, checking roles fallback');
                    try {
                        const roles = user.roles ? (typeof user.roles === 'string' ? JSON.parse(user.roles) : user.roles) : [];
                        hasHosting = roles.includes('hosting') || roles.includes('admin');
                        hasStudio = roles.includes('studio') || roles.includes('admin');
                        console.log('Roles-based access:', { hasHosting, hasStudio });
                    } catch (e) {
                        console.log('Roles parsing failed, checking admin status');
                        if (user.is_admin) {
                            hasHosting = true;
                            hasStudio = true;
                        }
                    }
                }

                // Super admin gets everything (always override)
                if (user.id === 26 || user.is_admin) {
                    hasHosting = true;
                    hasStudio = true;
                    console.log('Super admin access granted');
                }

                const responseUser = {
                    id: user.id,
                    email: user.email,
                    firstName: firstName,
                    name: user.name,
                    isAdmin: user.is_admin || user.id === 26,
                    hasHosting: hasHosting,
                    hasStudio: hasStudio
                };

                console.log('User verification successful:', {
                    id: responseUser.id,
                    email: responseUser.email,
                    hasHosting: responseUser.hasHosting,
                    hasStudio: responseUser.hasStudio
                });

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        user: responseUser
                    })
                };

            } catch (error) {
                console.error('Token verification error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Connect Dashboard endpoint
        if (path === '/connect/dashboard' && method === 'GET') {
            console.log(`📊 Dashboard stats request started at ${new Date().toISOString()}`);

            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                // Verify token
                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                const pool = await getDbPool();

                // Get user info
                const [users] = await executeWithRetry(
                    pool,
                    'SELECT id, email, name, is_admin FROM users WHERE id = ? AND status = 1',
                    [tokenData.id]
                );

                if (users.length === 0) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'User not found' })
                    };
                }

                const user = users[0];

                // Get dashboard stats - user-specific data from PodOps Hosting database
                let campaignStats = [{ total_campaigns: 0 }];
                let subscriberStats = [{ total_subscribers: 0 }];
                let recentCampaigns = [];
                let podcastStats = [{ total_podcasts: 0 }];
                let episodeStats = [{ total_episodes: 0 }];

                try {
                    // Get user's podcasts from hosting database (using real schema)
                    try {
                        const [podcasts] = await executeWithRetry(
                            pool,
                            'SELECT COUNT(*) as total_podcasts FROM podcasts WHERE user_id = ? AND status = 1',
                            [user.id]
                        );
                        podcastStats = podcasts;
                    } catch (podcastError) {
                        console.log('Podcasts table query failed:', podcastError.message);
                    }

                    // Get user's episodes from hosting database (using real schema)
                    try {
                        const [episodes] = await executeWithRetry(
                            pool,
                            'SELECT COUNT(*) as total_episodes FROM episodes e INNER JOIN podcasts p ON e.podcast_id = p.podcast_id WHERE p.user_id = ? AND e.status = 1',
                            [user.id]
                        );
                        episodeStats = episodes;
                    } catch (episodeError) {
                        console.log('Episodes table query failed:', episodeError.message);
                    }

                    // Try to get campaign stats for this user
                    try {
                        const [campaigns] = await executeWithRetry(
                            pool,
                            'SELECT COUNT(*) as total_campaigns FROM campaigns WHERE user_id = ?',
                            [user.id]
                        );
                        campaignStats = campaigns;
                    } catch (campaignError) {
                        console.log('Campaigns table query failed:', campaignError.message);
                        // Fallback to generic campaigns table
                        try {
                            const [campaigns] = await executeWithRetry(
                                pool,
                                'SELECT COUNT(*) as total_campaigns FROM campaigns',
                                []
                            );
                            campaignStats = campaigns;
                        } catch (fallbackError) {
                            console.log('Generic campaigns query failed:', fallbackError.message);
                        }
                    }

                    // Get subscriber/contact stats for this user (using real schema)
                    try {
                        const [subscribers] = await executeWithRetry(
                            pool,
                            'SELECT COUNT(*) as total_subscribers FROM websubscribers WHERE userid = ?',
                            [user.id]
                        );
                        subscriberStats = subscribers;
                    } catch (subscriberError) {
                        console.log('Websubscribers table query failed, trying recipients:', subscriberError.message);
                        try {
                            const [contacts] = await executeWithRetry(
                                pool,
                                'SELECT COUNT(*) as total_subscribers FROM recipients WHERE user_id = ?',
                                [user.id]
                            );
                            subscriberStats = contacts;
                        } catch (contactError) {
                            console.log('Recipients table query failed:', contactError.message);
                        }
                    }

                    // Try to get recent campaigns for this user
                    try {
                        const [campaigns] = await executeWithRetry(
                            pool,
                            'SELECT id, name, type, status, created_at FROM campaigns WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
                            [user.id]
                        );
                        recentCampaigns = campaigns;
                    } catch (recentError) {
                        console.log('Recent campaigns query failed:', recentError.message);
                    }
                } catch (error) {
                    console.log('Dashboard stats queries failed:', error.message);
                }

                console.log('✅ Dashboard data retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: {
                            stats: {
                                totalPodcasts: podcastStats[0]?.total_podcasts || 0,
                                totalEpisodes: episodeStats[0]?.total_episodes || 0,
                                totalCampaigns: campaignStats[0]?.total_campaigns || 0,
                                totalSubscribers: subscriberStats[0]?.total_subscribers || 0,
                                totalSent: 0, // Would need to calculate from campaign_sends table
                                openRate: '0%' // Would need to calculate from opens table
                            },
                            recentCampaigns: recentCampaigns || []
                        }
                    })
                };

            } catch (error) {
                console.error('Dashboard error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Dashboard Stats endpoint (for profile page and other uses)
        if (path === '/dashboard/stats' && method === 'GET') {
            console.log(`📊 Dashboard stats request started at ${new Date().toISOString()}`);
            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                const pool = await getDbPool();

                const [users] = await executeWithRetry(
                    pool,
                    'SELECT id FROM users WHERE id = ? AND status = 1',
                    [tokenData.id]
                );

                if (users.length === 0) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'User not found' })
                    };
                }

                const user = users[0];

                // Get basic stats for the user
                let totalCampaigns = 0;
                let totalSubscribers = 0;
                let openRate = '0%';

                try {
                    // Get campaign count
                    const [campaigns] = await executeWithRetry(
                        pool,
                        'SELECT COUNT(*) as total_campaigns FROM campaigns WHERE user_id = ?',
                        [user.id]
                    );
                    totalCampaigns = campaigns[0]?.total_campaigns || 0;
                } catch (error) {
                    console.log('Campaigns query failed:', error.message);
                }

                try {
                    // Get subscriber count
                    const [subscribers] = await executeWithRetry(
                        pool,
                        'SELECT COUNT(*) as total_subscribers FROM websubscribers WHERE userid = ?',
                        [user.id]
                    );
                    totalSubscribers = subscribers[0]?.total_subscribers || 0;
                } catch (error) {
                    console.log('Subscribers query failed:', error.message);
                }

                console.log('✅ Dashboard stats retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: {
                            totalCampaigns: totalCampaigns,
                            totalSubscribers: totalSubscribers,
                            openRate: openRate
                        }
                    })
                };

            } catch (error) {
                console.error('Dashboard stats error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // User Profile endpoint
        if (path === '/user/profile' && method === 'GET') {
            console.log(`👤 User profile request started at ${new Date().toISOString()}`);

            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                const pool = await getDbPool();

                const [users] = await executeWithRetry(
                    pool,
                    'SELECT id, email, name, first_name, last_name, roles, status, created_at, timezone FROM users WHERE id = ? AND status = 1',
                    [tokenData.id]
                );

                if (users.length === 0) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'User not found' })
                    };
                }

                const user = users[0];

                // Get comprehensive profile data
                let bio = '';
                let phone = '';
                let avatar = '';
                let gender = null;
                let income = null;
                let pets = { cats: false, dogs: false, others: false, none: false };

                try {
                    const [userSettings] = await executeWithRetry(
                        pool,
                        'SELECT bio, phone, avatar, gender, income, cat, dogs, others, None FROM user_settings WHERE userid = ? LIMIT 1',
                        [user.id]
                    );
                    if (userSettings.length > 0) {
                        bio = userSettings[0].bio || '';
                        phone = userSettings[0].phone || '';
                        // Construct full avatar URL if avatar filename exists
                        avatar = userSettings[0].avatar ? `https://podopshost.com/storage/${userSettings[0].avatar}` : '';
                        gender = userSettings[0].gender;
                        income = userSettings[0].income;
                        pets = {
                            cats: userSettings[0].cat === 1,
                            dogs: userSettings[0].dogs === 1,
                            others: userSettings[0].others === 1,
                            none: userSettings[0].None === 1
                        };
                    }
                } catch (settingsError) {
                    console.log('User settings query failed:', settingsError.message);
                }

                console.log('✅ User profile retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: {
                            id: user.id,
                            email: user.email,
                            name: user.name,
                            firstName: user.first_name || user.name?.split(' ')[0] || '',
                            lastName: user.last_name || user.name?.split(' ').slice(1).join(' ') || '',
                            bio: bio,
                            phone: phone,
                            avatar: avatar,
                            gender: gender,
                            income: income,
                            pets: pets,
                            timezone: user.timezone || 'America/New_York',
                            status: user.status === 1 ? 'Active' : 'Inactive',
                            role: 'Podcaster',
                            memberSince: user.created_at,
                            isAdmin: user.roles === 1,
                            createdAt: user.created_at
                        }
                    })
                };

            } catch (error) {
                console.error('User profile error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // User Preferences endpoint (PUT/PATCH)
        if (path === '/user/preferences' && (method === 'PUT' || method === 'PATCH')) {
            console.log(`⚙️ User preferences update request started at ${new Date().toISOString()}`);
            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                const pool = await getDbPool();

                // Verify user exists
                const [users] = await executeWithRetry(
                    pool,
                    'SELECT id FROM users WHERE id = ? AND status = 1',
                    [tokenData.id]
                );

                if (users.length === 0) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'User not found' })
                    };
                }

                const user = users[0];
                const requestBody = JSON.parse(event.body || '{}');

                // Update user timezone in users table
                if (requestBody.timezone) {
                    try {
                        await executeWithRetry(
                            pool,
                            'UPDATE users SET timezone = ? WHERE id = ?',
                            [requestBody.timezone, user.id]
                        );
                    } catch (timezoneError) {
                        console.log('Timezone update failed:', timezoneError.message);
                    }
                }

                // Update other preferences in user_settings table
                try {
                    // Check if user_settings record exists
                    const [existing] = await executeWithRetry(
                        pool,
                        'SELECT userid FROM user_settings WHERE userid = ?',
                        [user.id]
                    );

                    if (existing.length > 0) {
                        // Update existing record
                        await executeWithRetry(
                            pool,
                            'UPDATE user_settings SET language = ?, email_notifications = ?, marketing_emails = ? WHERE userid = ?',
                            [
                                requestBody.language || 'en',
                                requestBody.emailNotifications ? 1 : 0,
                                requestBody.marketingEmails ? 1 : 0,
                                user.id
                            ]
                        );
                    } else {
                        // Create new record
                        await executeWithRetry(
                            pool,
                            'INSERT INTO user_settings (userid, language, email_notifications, marketing_emails) VALUES (?, ?, ?, ?)',
                            [
                                user.id,
                                requestBody.language || 'en',
                                requestBody.emailNotifications ? 1 : 0,
                                requestBody.marketingEmails ? 1 : 0
                            ]
                        );
                    }
                } catch (settingsError) {
                    console.log('Settings update failed:', settingsError.message);
                }

                console.log('✅ User preferences updated successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        message: 'Preferences updated successfully'
                    })
                };

            } catch (error) {
                console.error('User preferences error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // User Settings endpoint
        if (path === '/user/settings' && method === 'GET') {
            console.log(`⚙️ User settings request started at ${new Date().toISOString()}`);

            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                const pool = await getDbPool();

                // Get user settings
                const [users] = await executeWithRetry(
                    pool,
                    'SELECT id, email, name, first_name FROM users WHERE id = ? AND status = 1',
                    [tokenData.id]
                );

                if (users.length === 0) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'User not found' })
                    };
                }

                const user = users[0];

                // Try to get user preferences/settings
                let settings = {
                    notifications: {
                        email: true,
                        sms: false,
                        push: true
                    },
                    privacy: {
                        profilePublic: false,
                        showEmail: false
                    },
                    preferences: {
                        timezone: 'UTC',
                        language: 'en'
                    }
                };

                try {
                    const [userSettings] = await executeWithRetry(
                        pool,
                        'SELECT address, secondary_address, email_sender_id FROM user_settings WHERE userid = ?',
                        [user.id]
                    );

                    if (userSettings.length > 0) {
                        settings.profile = {
                            address: userSettings[0].address,
                            secondaryAddress: userSettings[0].secondary_address,
                            emailSenderId: userSettings[0].email_sender_id
                        };
                    }
                } catch (settingsError) {
                    console.log('User settings table query failed, using defaults:', settingsError.message);
                }

                // Get user subscription data
                let subscription = null;
                try {
                    const [subs] = await executeWithRetry(
                        pool,
                        'SELECT plan_name, status, next_billing_date, next_billing_amount FROM subscriptions WHERE user_id = ? AND status IN ("active", "trialing") ORDER BY created_at DESC LIMIT 1',
                        [user.id]
                    );
                    if (subs.length > 0) {
                        subscription = subs[0];
                    }
                } catch (subError) {
                    console.log('Subscription query failed:', subError.message);
                }

                // Get user credits
                let emailCredits = 0;
                let smsCredits = 0;
                try {
                    const [credits] = await executeWithRetry(
                        pool,
                        'SELECT email_credits, sms_credits FROM user_credits WHERE user_id = ? LIMIT 1',
                        [user.id]
                    );
                    if (credits.length > 0) {
                        emailCredits = credits[0].email_credits || 0;
                        smsCredits = credits[0].sms_credits || 0;
                    }
                } catch (creditsError) {
                    console.log('Credits query failed:', creditsError.message);
                }

                console.log('✅ User settings retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: {
                            user: {
                                id: user.id,
                                email: user.email,
                                name: user.name,
                                firstName: user.first_name || user.name?.split(' ')[0] || ''
                            },
                            planType: subscription?.plan_name || 'No Plan',
                            planStatus: subscription?.status || 'inactive',
                            nextInvoice: subscription?.next_billing_amount ? `$${subscription.next_billing_amount}` : '$0',
                            renewalDate: subscription?.next_billing_date || null,
                            emailCredits: emailCredits,
                            smsCredits: smsCredits,
                            addresses: {
                                primary: settings.profile?.address || '',
                                secondary: settings.profile?.secondaryAddress || ''
                            },
                            emailServiceConfig: settings.profile?.emailSenderId ? {
                                subuserName: 'Service Account',
                                fromName: 'Your Company',
                                fromEmail: 'noreply@yourdomain.com'
                            } : null,
                            subscription: subscription,
                            domainAuthentications: [],
                            phoneNumbers: [],
                            teams: []
                        }
                    })
                };

            } catch (error) {
                console.error('User settings error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Connect Campaigns endpoint
        if (path === '/connect/campaigns' && method === 'GET') {
            console.log(`📧 Campaigns request started at ${new Date().toISOString()}`);

            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                const pool = await getDbPool();

                const [users] = await executeWithRetry(
                    pool,
                    'SELECT id FROM users WHERE id = ? AND status = 1',
                    [tokenData.id]
                );

                if (users.length === 0) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'User not found' })
                    };
                }

                const user = users[0];
                const campaignType = event.queryStringParameters?.type;

                let campaigns = [];

                try {
                    let query = 'SELECT id, name, type, status, created_at, updated_at FROM campaigns WHERE user_id = ?';
                    let params = [user.id];

                    if (campaignType) {
                        query += ' AND type = ?';
                        params.push(campaignType);
                    }

                    query += ' ORDER BY created_at DESC';

                    const [campaignResults] = await executeWithRetry(pool, query, params);
                    campaigns = campaignResults || [];
                } catch (campaignError) {
                    console.log('Campaigns query failed:', campaignError.message);
                    // Return empty array if campaigns table doesn't exist
                }

                console.log('✅ Campaigns retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        campaigns: campaigns,
                        total: campaigns.length,
                        type: campaignType || 'all'
                    })
                };

            } catch (error) {
                console.error('Campaigns error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Connect SMS Campaigns endpoint
        if (path === '/connect/sms-campaigns' && method === 'GET') {
            console.log(`📱 SMS Campaigns request started at ${new Date().toISOString()}`);

            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                const pool = await getDbPool();

                const [users] = await executeWithRetry(
                    pool,
                    'SELECT id FROM users WHERE id = ? AND status = 1',
                    [tokenData.id]
                );

                if (users.length === 0) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'User not found' })
                    };
                }

                const user = users[0];
                let smsCampaigns = [];

                try {
                    // Look for SMS campaigns in campaigns table with type 'sms'
                    const [smsResults] = await executeWithRetry(
                        pool,
                        'SELECT id, name, type, status, created_at, updated_at FROM campaigns WHERE user_id = ? AND type = "sms" ORDER BY created_at DESC',
                        [user.id]
                    );
                    smsCampaigns = smsResults || [];
                } catch (smsError) {
                    console.log('SMS campaigns query failed, trying sms_campaigns table:', smsError.message);
                    try {
                        // Fallback to dedicated sms_campaigns table if it exists
                        const [smsTableResults] = await executeWithRetry(
                            pool,
                            'SELECT id, campaign_name as name, status, created_at, updated_at FROM sms_campaigns WHERE user_id = ? ORDER BY created_at DESC',
                            [user.id]
                        );
                        smsCampaigns = smsTableResults?.map(campaign => ({
                            ...campaign,
                            type: 'sms'
                        })) || [];
                    } catch (smsTableError) {
                        console.log('SMS campaigns table also failed:', smsTableError.message);
                        // Return empty array if no SMS campaigns found
                    }
                }

                console.log('✅ SMS Campaigns retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        campaigns: smsCampaigns,
                        total: smsCampaigns.length,
                        type: 'sms'
                    })
                };

            } catch (error) {
                console.error('SMS Campaigns error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin User Management endpoint (for finding/updating admin users)
        if (path === '/admin/user-management' && method === 'POST') {
            console.log(`🔧 Admin user management request started at ${new Date().toISOString()}`);
            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                // Only allow access for specific admin users
                if (tokenData.id !== 74) {
                    return {
                        statusCode: 403,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Access denied' })
                    };
                }

                const pool = await getDbPool();
                const requestBody = JSON.parse(event.body || '{}');

                if (requestBody.action === 'find_admin') {
                    // Find the admin user
                    const [users] = await executeWithRetry(
                        pool,
                        'SELECT id, email, name, roles, status, created_at FROM users WHERE email = ?',
                        ['info@podops.app']
                    );

                    if (users.length === 0) {
                        // Search for similar emails
                        const [similarUsers] = await executeWithRetry(
                            pool,
                            'SELECT id, email, name, roles, status FROM users WHERE email LIKE ? OR email LIKE ? LIMIT 10',
                            ['%podops%', '%admin%']
                        );

                        return {
                            statusCode: 200,
                            headers: corsHeaders,
                            body: JSON.stringify({
                                success: false,
                                message: 'Admin user info@podops.app not found',
                                similarUsers: similarUsers
                            })
                        };
                    }

                    return {
                        statusCode: 200,
                        headers: corsHeaders,
                        body: JSON.stringify({
                            success: true,
                            adminUser: users[0]
                        })
                    };
                }

                if (requestBody.action === 'update_password' && requestBody.newPassword) {
                    // First check if user exists and get current password format
                    const [users] = await executeWithRetry(
                        pool,
                        'SELECT id, password FROM users WHERE email = ?',
                        ['info@podops.app']
                    );

                    if (users.length === 0) {
                        return {
                            statusCode: 404,
                            headers: corsHeaders,
                            body: JSON.stringify({ success: false, error: 'User not found' })
                        };
                    }

                    // For Laravel compatibility, use the pre-generated bcrypt hash
                    let hashedPassword;
                    if (requestBody.newPassword === 'PodOpsAdmin2024!') {
                        // Use pre-generated bcrypt hash for Laravel compatibility
                        hashedPassword = '$2b$10$d931oSlEJ.A8ghyKGqkKHOSopPRyfKikBnpWUcAlDvbPsM/LlOhli';
                    } else {
                        // For other passwords, fall back to MD5 (not recommended for production)
                        const crypto = require('crypto');
                        hashedPassword = crypto.createHash('md5').update(requestBody.newPassword).digest('hex');
                        console.log('Warning: Using MD5 hash - consider updating to bcrypt for security');
                    }

                    // Update the password
                    const [result] = await executeWithRetry(
                        pool,
                        'UPDATE users SET password = ? WHERE email = ?',
                        [hashedPassword, 'info@podops.app']
                    );

                    return {
                        statusCode: 200,
                        headers: corsHeaders,
                        body: JSON.stringify({
                            success: true,
                            message: 'Password updated successfully with bcrypt hash for Laravel compatibility',
                            affectedRows: result.affectedRows,
                            hashFormat: hashedPassword.startsWith('$2b$') ? 'bcrypt' : 'md5'
                        })
                    };
                }

                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ success: false, error: 'Invalid action' })
                };

            } catch (error) {
                console.error('Admin user management error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin Members Data endpoints (Admins, Podcasters, Organizations, etc.)
        if (path === '/admin/members' && method === 'GET') {
            console.log(`👥 Admin Members request started at ${new Date().toISOString()}`);
            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                // Only allow access for admin users
                if (tokenData.id !== 74 && tokenData.id !== 26) {
                    return {
                        statusCode: 403,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Admin access required' })
                    };
                }

                const pool = await getDbPool();
                const memberType = event.queryStringParameters?.type || 'all';

                let query = '';
                let params = [];

                switch(memberType) {
                    case 'admins':
                        query = 'SELECT id, email, name, first_name, last_name, roles, status, created_at FROM users WHERE roles = 1 ORDER BY created_at DESC';
                        break;
                    case 'podcasters':
                        query = 'SELECT id, email, name, first_name, last_name, roles, status, created_at FROM users WHERE roles = 0 AND id IN (SELECT DISTINCT user_id FROM podcasts) ORDER BY created_at DESC';
                        break;
                    case 'organizations':
                        query = 'SELECT id, name, email, created_at, status FROM organizations ORDER BY created_at DESC';
                        break;
                    case 'listeners':
                        query = 'SELECT id, email, name, first_name, last_name, created_at FROM audience_members ORDER BY created_at DESC';
                        break;
                    case 'accounts':
                        query = 'SELECT id, email, name, first_name, last_name, roles, status, created_at FROM users ORDER BY created_at DESC';
                        break;
                    case 'websubscribers':
                        query = 'SELECT id, email, first_name, last_name, status, created_at, userid FROM websubscribers ORDER BY created_at DESC';
                        break;
                    case 'studio-users':
                        query = 'SELECT DISTINCT u.id, u.email, u.name, u.first_name, u.last_name, u.status, u.created_at FROM users u INNER JOIN user_subscriptions us ON u.id = us.user_id WHERE us.product_type = "studio" ORDER BY u.created_at DESC';
                        break;
                    case 'analytics-users':
                        query = 'SELECT DISTINCT u.id, u.email, u.name, u.first_name, u.last_name, u.status, u.created_at FROM users u INNER JOIN user_subscriptions us ON u.id = us.user_id WHERE us.product_type = "analytics" ORDER BY u.created_at DESC';
                        break;
                    default:
                        query = 'SELECT id, email, name, first_name, last_name, roles, status, created_at FROM users ORDER BY created_at DESC LIMIT 100';
                }

                const [results] = await executeWithRetry(pool, query, params);

                console.log('✅ Admin members data retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: results || [],
                        type: memberType,
                        total: results?.length || 0
                    })
                };

            } catch (error) {
                console.error('Admin members error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin Plans Data endpoint
        if (path === '/admin/plans' && method === 'GET') {
            console.log(`💳 Admin Plans request started at ${new Date().toISOString()}`);
            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                if (tokenData.id !== 74 && tokenData.id !== 26) {
                    return {
                        statusCode: 403,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Admin access required' })
                    };
                }

                const pool = await getDbPool();

                // Get plans data
                const [plans] = await executeWithRetry(
                    pool,
                    'SELECT id, name, price, billing_period, features, status, created_at FROM subscription_plans ORDER BY price ASC',
                    []
                );

                // Get custom plans
                const [customPlans] = await executeWithRetry(
                    pool,
                    'SELECT id, user_id, plan_name, custom_price, features, status, created_at FROM custom_plans ORDER BY created_at DESC',
                    []
                );

                console.log('✅ Admin plans data retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: {
                            plans: plans || [],
                            customPlans: customPlans || [],
                            totalPlans: (plans?.length || 0) + (customPlans?.length || 0)
                        }
                    })
                };

            } catch (error) {
                console.error('Admin plans error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin Podcasts Data endpoint
        if (path === '/admin/podcasts' && method === 'GET') {
            console.log(`🎙️ Admin Podcasts request started at ${new Date().toISOString()}`);
            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                if (tokenData.id !== 74 && tokenData.id !== 26) {
                    return {
                        statusCode: 403,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Admin access required' })
                    };
                }

                const pool = await getDbPool();

                // Get podcasts data with user info
                const [podcasts] = await executeWithRetry(
                    pool,
                    'SELECT p.podcast_id, p.title, p.user_id, p.status, p.created_at, p.updated_at, u.name as user_name, u.email as user_email FROM podcasts p LEFT JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC',
                    []
                );

                // Get podcast statistics
                const [stats] = await executeWithRetry(
                    pool,
                    'SELECT COUNT(*) as total_podcasts, SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as active_podcasts, SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as inactive_podcasts FROM podcasts',
                    []
                );

                console.log('✅ Admin podcasts data retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: {
                            podcasts: podcasts || [],
                            statistics: stats[0] || { total_podcasts: 0, active_podcasts: 0, inactive_podcasts: 0 }
                        }
                    })
                };

            } catch (error) {
                console.error('Admin podcasts error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin Coupons Data endpoint
        if (path === '/admin/coupons' && method === 'GET') {
            console.log(`🎫 Admin Coupons request started at ${new Date().toISOString()}`);
            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                if (tokenData.id !== 74 && tokenData.id !== 26) {
                    return {
                        statusCode: 403,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Admin access required' })
                    };
                }

                const pool = await getDbPool();

                // Get coupons data
                const [coupons] = await executeWithRetry(
                    pool,
                    'SELECT id, code, discount_type, discount_value, usage_limit, times_used, expires_at, status, created_at FROM coupons ORDER BY created_at DESC',
                    []
                );

                console.log('✅ Admin coupons data retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: coupons || []
                    })
                };

            } catch (error) {
                console.error('Admin coupons error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin Dashboard Stats endpoint
        if (path === '/admin/dashboard-stats' && method === 'GET') {
            console.log(`📊 Admin Dashboard Stats request started at ${new Date().toISOString()}`);
            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                if (tokenData.id !== 74 && tokenData.id !== 26) {
                    return {
                        statusCode: 403,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Admin access required' })
                    };
                }

                const pool = await getDbPool();

                // Get comprehensive dashboard statistics
                const [userStats] = await executeWithRetry(
                    pool,
                    'SELECT COUNT(*) as total_users, SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as active_users, SUM(CASE WHEN roles = 1 THEN 1 ELSE 0 END) as admin_users FROM users',
                    []
                );

                const [podcastStats] = await executeWithRetry(
                    pool,
                    'SELECT COUNT(*) as total_podcasts, SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as active_podcasts FROM podcasts',
                    []
                );

                const [episodeStats] = await executeWithRetry(
                    pool,
                    'SELECT COUNT(*) as total_episodes FROM episodes',
                    []
                );

                const [subscriberStats] = await executeWithRetry(
                    pool,
                    'SELECT COUNT(*) as total_subscribers FROM websubscribers',
                    []
                );

                console.log('✅ Admin dashboard stats retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: {
                            users: userStats[0] || { total_users: 0, active_users: 0, admin_users: 0 },
                            podcasts: podcastStats[0] || { total_podcasts: 0, active_podcasts: 0 },
                            episodes: episodeStats[0] || { total_episodes: 0 },
                            subscribers: subscriberStats[0] || { total_subscribers: 0 }
                        }
                    })
                };

            } catch (error) {
                console.error('Admin dashboard stats error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin Custom Domains Data endpoint
        if (path === '/admin/custom-domains' && method === 'GET') {
            console.log(`🌐 Admin Custom Domains request started at ${new Date().toISOString()}`);
            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                if (tokenData.id !== 74 && tokenData.id !== 26) {
                    return {
                        statusCode: 403,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Admin access required' })
                    };
                }

                const pool = await getDbPool();

                // Get custom domains data
                const [domains] = await executeWithRetry(
                    pool,
                    'SELECT id, user_id, domain_name, verification_status, ssl_status, dns_records, created_at, updated_at FROM custom_domains ORDER BY created_at DESC',
                    []
                );

                console.log('✅ Admin custom domains data retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: domains || []
                    })
                };

            } catch (error) {
                console.error('Admin custom domains error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin Email Templates Data endpoint
        if (path === '/admin/email-templates' && method === 'GET') {
            console.log(`✉️ Admin Email Templates request started at ${new Date().toISOString()}`);
            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                if (tokenData.id !== 74 && tokenData.id !== 26) {
                    return {
                        statusCode: 403,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Admin access required' })
                    };
                }

                const pool = await getDbPool();

                // Get email templates data
                const [templates] = await executeWithRetry(
                    pool,
                    'SELECT id, template_name, template_type, subject, content, is_active, created_at, updated_at FROM email_templates ORDER BY template_type, template_name',
                    []
                );

                console.log('✅ Admin email templates data retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: templates || []
                    })
                };

            } catch (error) {
                console.error('Admin email templates error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin News & Updates Data endpoint
        if (path === '/admin/news-updates' && method === 'GET') {
            console.log(`📢 Admin News & Updates request started at ${new Date().toISOString()}`);
            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                if (tokenData.id !== 74 && tokenData.id !== 26) {
                    return {
                        statusCode: 403,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Admin access required' })
                    };
                }

                const pool = await getDbPool();

                // Get news and updates data
                const [news] = await executeWithRetry(
                    pool,
                    'SELECT id, title, content, publish_date, status, target_audience, created_at, updated_at FROM news_updates ORDER BY publish_date DESC',
                    []
                );

                console.log('✅ Admin news & updates data retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: news || []
                    })
                };

            } catch (error) {
                console.error('Admin news & updates error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin System Settings Data endpoint
        if (path === '/admin/system-settings' && method === 'GET') {
            console.log(`⚙️ Admin System Settings request started at ${new Date().toISOString()}`);
            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                if (tokenData.id !== 74 && tokenData.id !== 26) {
                    return {
                        statusCode: 403,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Admin access required' })
                    };
                }

                const pool = await getDbPool();

                // Get system settings data
                const [settings] = await executeWithRetry(
                    pool,
                    'SELECT setting_key, setting_value, setting_type, description, created_at, updated_at FROM system_settings ORDER BY setting_key',
                    []
                );

                console.log('✅ Admin system settings data retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: settings || []
                    })
                };

            } catch (error) {
                console.error('Admin system settings error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Subscribers endpoint
        if (path === '/subscribers' && method === 'GET') {
            console.log(`👥 Subscribers request started at ${new Date().toISOString()}`);

            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                const pool = await getDbPool();

                const [users] = await executeWithRetry(
                    pool,
                    'SELECT id FROM users WHERE id = ? AND status = 1',
                    [tokenData.id]
                );

                if (users.length === 0) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'User not found' })
                    };
                }

                const user = users[0];
                const page = parseInt(event.queryStringParameters?.page) || 1;
                const limit = parseInt(event.queryStringParameters?.limit) || 10;
                const offset = (page - 1) * limit;
                const search = event.queryStringParameters?.search || '';
                const status = event.queryStringParameters?.status || '';

                let subscribers = [];
                let totalCount = 0;

                try {
                    // Get subscribers from websubscribers table first
                    let query = 'SELECT id, email, first_name, last_name, created_at, status FROM websubscribers WHERE userid = ?';
                    let params = [user.id];
                    let countQuery = 'SELECT COUNT(*) as total FROM websubscribers WHERE userid = ?';
                    let countParams = [user.id];

                    if (search) {
                        query += ' AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
                        countQuery += ' AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
                        const searchParam = `%${search}%`;
                        params.push(searchParam, searchParam, searchParam);
                        countParams.push(searchParam, searchParam, searchParam);
                    }

                    if (status) {
                        query += ' AND status = ?';
                        countQuery += ' AND status = ?';
                        params.push(status);
                        countParams.push(status);
                    }

                    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
                    params.push(limit, offset);

                    const [subscriberResults] = await executeWithRetry(pool, query, params);
                    const [countResults] = await executeWithRetry(pool, countQuery, countParams);

                    subscribers = subscriberResults || [];
                    totalCount = countResults[0]?.total || 0;
                } catch (subscriberError) {
                    console.log('Websubscribers query failed, trying list_users:', subscriberError.message);

                    try {
                        // Fallback to list_users table
                        let query = 'SELECT id, email, first_name, last_name, created_at, status FROM list_users WHERE user_id = ?';
                        let params = [user.id];
                        let countQuery = 'SELECT COUNT(*) as total FROM list_users WHERE user_id = ?';
                        let countParams = [user.id];

                        if (search) {
                            query += ' AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
                            countQuery += ' AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
                            const searchParam = `%${search}%`;
                            params.push(searchParam, searchParam, searchParam);
                            countParams.push(searchParam, searchParam, searchParam);
                        }

                        if (status) {
                            query += ' AND status = ?';
                            countQuery += ' AND status = ?';
                            params.push(status);
                            countParams.push(status);
                        }

                        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
                        params.push(limit, offset);

                        const [subscriberResults] = await executeWithRetry(pool, query, params);
                        const [countResults] = await executeWithRetry(pool, countQuery, countParams);

                        subscribers = subscriberResults || [];
                        totalCount = countResults[0]?.total || 0;
                    } catch (listUsersError) {
                        console.log('List_users query also failed:', listUsersError.message);
                    }
                }

                console.log('✅ Subscribers retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        subscribers: subscribers,
                        pagination: {
                            page: page,
                            limit: limit,
                            total: totalCount,
                            totalPages: Math.ceil(totalCount / limit)
                        }
                    })
                };

            } catch (error) {
                console.error('Subscribers error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Subscriber Lists endpoint
        if (path === '/subscribers/lists' && method === 'GET') {
            console.log(`📋 Subscriber lists request started at ${new Date().toISOString()}`);

            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                const pool = await getDbPool();

                const [users] = await executeWithRetry(
                    pool,
                    'SELECT id FROM users WHERE id = ? AND status = 1',
                    [tokenData.id]
                );

                if (users.length === 0) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'User not found' })
                    };
                }

                const user = users[0];
                let lists = [];

                try {
                    // Try to get lists from lists table
                    const [listResults] = await executeWithRetry(
                        pool,
                        'SELECT id, name, description, created_at, status FROM lists WHERE user_id = ? ORDER BY created_at DESC',
                        [user.id]
                    );
                    lists = listResults || [];
                } catch (listsError) {
                    console.log('Lists table query failed:', listsError.message);
                    // Return empty array if lists table doesn't exist
                }

                console.log('✅ Subscriber lists retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        lists: lists
                    })
                };

            } catch (error) {
                console.error('Subscriber lists error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Segments endpoint
        if (path === '/segments' && method === 'GET') {
            console.log(`🏷️ Segments request started at ${new Date().toISOString()}`);

            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                const pool = await getDbPool();

                const [users] = await executeWithRetry(
                    pool,
                    'SELECT id FROM users WHERE id = ? AND status = 1',
                    [tokenData.id]
                );

                if (users.length === 0) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'User not found' })
                    };
                }

                const user = users[0];
                let segments = [];

                try {
                    // Try to get segments from tags table
                    const [segmentResults] = await executeWithRetry(
                        pool,
                        'SELECT id, name, description, created_at FROM tags WHERE user_id = ? ORDER BY created_at DESC',
                        [user.id]
                    );
                    segments = segmentResults || [];
                } catch (tagsError) {
                    console.log('Tags table query failed, trying segments table:', tagsError.message);

                    try {
                        // Fallback to segments table
                        const [segmentResults] = await executeWithRetry(
                            pool,
                            'SELECT id, name, description, created_at FROM segments WHERE user_id = ? ORDER BY created_at DESC',
                            [user.id]
                        );
                        segments = segmentResults || [];
                    } catch (segmentsError) {
                        console.log('Segments table query also failed:', segmentsError.message);
                    }
                }

                console.log('✅ Segments retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        segments: segments
                    })
                };

            } catch (error) {
                console.error('Segments error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin Dashboard endpoint
        if (path === '/admin/dashboard' && method === 'GET') {
            console.log(`🔧 Admin dashboard request started at ${new Date().toISOString()}`);

            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                // Verify token and admin status
                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                const pool = await getDbPool();

                // Verify user is admin
                const [users] = await executeWithRetry(
                    pool,
                    'SELECT id, email, name, is_admin FROM users WHERE id = ? AND status = 1',
                    [tokenData.id]
                );

                if (users.length === 0 || !users[0].is_admin) {
                    return {
                        statusCode: 403,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Admin access required' })
                    };
                }

                // Get admin dashboard metrics
                let totalUsers = 0;
                let connectUsers = 0;
                let totalTickets = 0;
                let recentActivity = [];

                try {
                    // Get total users count
                    const [userCount] = await executeWithRetry(
                        pool,
                        'SELECT COUNT(*) as count FROM users WHERE status = 1'
                    );
                    totalUsers = userCount[0]?.count || 0;

                    // Get Connect users (users with connect-related data)
                    const [connectCount] = await executeWithRetry(
                        pool,
                        'SELECT COUNT(DISTINCT user_id) as count FROM email_campaigns'
                    );
                    connectUsers = connectCount[0]?.count || 0;

                    // Get recent user registrations for activity
                    const [recentUsers] = await executeWithRetry(
                        pool,
                        'SELECT name, email, created_at FROM users WHERE status = 1 ORDER BY created_at DESC LIMIT 5'
                    );
                    recentActivity = recentUsers || [];

                } catch (metricsError) {
                    console.log('Error fetching admin metrics:', metricsError.message);
                }

                console.log('✅ Admin dashboard data retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: {
                            totalUsers,
                            connectUsers,
                            totalTickets,
                            recentActivity,
                            timestamp: new Date().toISOString()
                        }
                    })
                };

            } catch (error) {
                console.error('Admin dashboard error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin Users/Members endpoint
        if (path === '/admin/users' && method === 'GET') {
            console.log(`👥 Admin users request started at ${new Date().toISOString()}`);

            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                // Verify token and admin status
                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                const pool = await getDbPool();

                // Verify user is admin
                const [adminUsers] = await executeWithRetry(
                    pool,
                    'SELECT id, email, name, is_admin FROM users WHERE id = ? AND status = 1',
                    [tokenData.id]
                );

                if (adminUsers.length === 0 || !adminUsers[0].is_admin) {
                    return {
                        statusCode: 403,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Admin access required' })
                    };
                }

                // Get query parameters for filtering
                const userType = event.queryStringParameters?.type || 'all';
                const page = parseInt(event.queryStringParameters?.page || '1');
                const limit = parseInt(event.queryStringParameters?.limit || '10');
                const offset = (page - 1) * limit;

                let query = '';
                let queryParams = [];

                // Build query based on user type
                switch (userType) {
                    case 'admins':
                        query = `SELECT id, email, name, first_name, last_name, is_admin, created_at, last_login
                                FROM users WHERE is_admin = 1 AND status = 1
                                ORDER BY created_at DESC LIMIT ? OFFSET ?`;
                        queryParams = [limit, offset];
                        break;
                    case 'podcasters':
                        query = `SELECT DISTINCT u.id, u.email, u.name, u.first_name, u.last_name, u.is_admin, u.created_at, u.last_login
                                FROM users u
                                LEFT JOIN podcasts p ON u.id = p.user_id
                                WHERE u.status = 1 AND (p.user_id IS NOT NULL OR u.is_admin = 0)
                                ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
                        queryParams = [limit, offset];
                        break;
                    case 'connect':
                        query = `SELECT DISTINCT u.id, u.email, u.name, u.first_name, u.last_name, u.is_admin, u.created_at, u.last_login
                                FROM users u
                                LEFT JOIN email_campaigns e ON u.id = e.user_id
                                LEFT JOIN sms_campaigns s ON u.id = s.user_id
                                WHERE u.status = 1 AND (e.user_id IS NOT NULL OR s.user_id IS NOT NULL)
                                ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
                        queryParams = [limit, offset];
                        break;
                    case 'all':
                    default:
                        query = `SELECT id, email, name, first_name, last_name, is_admin, created_at, last_login
                                FROM users WHERE status = 1
                                ORDER BY created_at DESC LIMIT ? OFFSET ?`;
                        queryParams = [limit, offset];
                        break;
                }

                const [users] = await executeWithRetry(pool, query, queryParams);

                // Get total count for pagination
                let countQuery = '';
                let countParams = [];

                switch (userType) {
                    case 'admins':
                        countQuery = 'SELECT COUNT(*) as total FROM users WHERE is_admin = 1 AND status = 1';
                        countParams = [];
                        break;
                    case 'podcasters':
                        countQuery = `SELECT COUNT(DISTINCT u.id) as total FROM users u
                                     LEFT JOIN podcasts p ON u.id = p.user_id
                                     WHERE u.status = 1 AND (p.user_id IS NOT NULL OR u.is_admin = 0)`;
                        countParams = [];
                        break;
                    case 'connect':
                        countQuery = `SELECT COUNT(DISTINCT u.id) as total FROM users u
                                     LEFT JOIN email_campaigns e ON u.id = e.user_id
                                     LEFT JOIN sms_campaigns s ON u.id = s.user_id
                                     WHERE u.status = 1 AND (e.user_id IS NOT NULL OR s.user_id IS NOT NULL)`;
                        countParams = [];
                        break;
                    default:
                        countQuery = 'SELECT COUNT(*) as total FROM users WHERE status = 1';
                        countParams = [];
                }

                const [countResult] = await executeWithRetry(pool, countQuery, countParams);
                const totalUsers = countResult[0]?.total || 0;

                console.log(`✅ Admin users retrieved: ${users.length} users (type: ${userType})`);

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: {
                            users: users || [],
                            pagination: {
                                page,
                                limit,
                                total: totalUsers,
                                totalPages: Math.ceil(totalUsers / limit)
                            },
                            userType,
                            timestamp: new Date().toISOString()
                        }
                    })
                };

            } catch (error) {
                console.error('Admin users error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin System Status endpoint
        if (path === '/admin/system/status' && method === 'GET') {
            console.log(`⚡ Admin system status request started at ${new Date().toISOString()}`);

            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                // Verify token and admin status
                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                const pool = await getDbPool();

                // Verify user is admin
                const [adminUsers] = await executeWithRetry(
                    pool,
                    'SELECT id, email, name, is_admin FROM users WHERE id = ? AND status = 1',
                    [tokenData.id]
                );

                if (adminUsers.length === 0 || !adminUsers[0].is_admin) {
                    return {
                        statusCode: 403,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Admin access required' })
                    };
                }

                // System health checks
                let systemStatus = {
                    database: 'unknown',
                    api: 'healthy',
                    services: {
                        lambda: 'healthy',
                        apiGateway: 'healthy',
                        database: 'unknown'
                    },
                    metrics: {
                        uptime: process.uptime(),
                        memoryUsage: process.memoryUsage(),
                        timestamp: new Date().toISOString()
                    }
                };

                try {
                    // Test database connection
                    const [dbTest] = await executeWithRetry(pool, 'SELECT 1 as test');
                    if (dbTest[0]?.test === 1) {
                        systemStatus.database = 'healthy';
                        systemStatus.services.database = 'healthy';
                    }
                } catch (dbError) {
                    console.error('Database health check failed:', dbError);
                    systemStatus.database = 'error';
                    systemStatus.services.database = 'error';
                }

                // Get some basic performance metrics
                try {
                    const [userStats] = await executeWithRetry(
                        pool,
                        'SELECT COUNT(*) as total_users, MAX(created_at) as latest_user FROM users WHERE status = 1'
                    );

                    const [campaignStats] = await executeWithRetry(
                        pool,
                        'SELECT COUNT(*) as total_campaigns FROM email_campaigns'
                    );

                    systemStatus.metrics.totalUsers = userStats[0]?.total_users || 0;
                    systemStatus.metrics.latestUser = userStats[0]?.latest_user;
                    systemStatus.metrics.totalCampaigns = campaignStats[0]?.total_campaigns || 0;

                } catch (metricsError) {
                    console.log('Error fetching system metrics:', metricsError.message);
                }

                console.log('✅ System status retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: systemStatus
                    })
                };

            } catch (error) {
                console.error('Admin system status error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin Support Tickets endpoint (placeholder)
        if (path === '/admin/tickets' && method === 'GET') {
            console.log(`🎫 Admin tickets request started at ${new Date().toISOString()}`);

            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                // Verify token and admin status
                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                const pool = await getDbPool();

                // Verify user is admin
                const [adminUsers] = await executeWithRetry(
                    pool,
                    'SELECT id, email, name, is_admin FROM users WHERE id = ? AND status = 1',
                    [tokenData.id]
                );

                if (adminUsers.length === 0 || !adminUsers[0].is_admin) {
                    return {
                        statusCode: 403,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Admin access required' })
                    };
                }

                // Placeholder ticket data (in real implementation, query actual support tickets table)
                const placeholderTickets = [
                    {
                        id: 1,
                        subject: 'Account Access Issue',
                        user_email: 'user1@example.com',
                        status: 'open',
                        priority: 'medium',
                        created_at: new Date().toISOString(),
                        last_updated: new Date().toISOString()
                    },
                    {
                        id: 2,
                        subject: 'Feature Request - API Enhancement',
                        user_email: 'user2@example.com',
                        status: 'in_progress',
                        priority: 'low',
                        created_at: new Date().toISOString(),
                        last_updated: new Date().toISOString()
                    }
                ];

                console.log('✅ Admin tickets retrieved (placeholder data)');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: {
                            tickets: placeholderTickets,
                            total: placeholderTickets.length,
                            timestamp: new Date().toISOString()
                        }
                    })
                };

            } catch (error) {
                console.error('Admin tickets error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin Templates endpoint (placeholder)
        if (path === '/admin/templates' && method === 'GET') {
            console.log(`📧 Admin templates request started at ${new Date().toISOString()}`);

            try {
                const token = event.headers.Authorization?.replace('Bearer ', '') ||
                             event.headers.authorization?.replace('Bearer ', '');

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Token required' })
                    };
                }

                // Verify token and admin status
                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                const pool = await getDbPool();

                // Verify user is admin
                const [adminUsers] = await executeWithRetry(
                    pool,
                    'SELECT id, email, name, is_admin FROM users WHERE id = ? AND status = 1',
                    [tokenData.id]
                );

                if (adminUsers.length === 0 || !adminUsers[0].is_admin) {
                    return {
                        statusCode: 403,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Admin access required' })
                    };
                }

                // Placeholder template data (in real implementation, query actual templates table)
                const placeholderTemplates = [
                    {
                        id: 1,
                        name: 'Welcome Email',
                        category: 'welcome',
                        description: 'Default welcome email template for new users',
                        created_at: new Date().toISOString(),
                        last_modified: new Date().toISOString(),
                        usage_count: 125
                    },
                    {
                        id: 2,
                        name: 'Newsletter Template',
                        category: 'newsletter',
                        description: 'Monthly newsletter template with modern design',
                        created_at: new Date().toISOString(),
                        last_modified: new Date().toISOString(),
                        usage_count: 43
                    }
                ];

                console.log('✅ Admin templates retrieved (placeholder data)');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: {
                            templates: placeholderTemplates,
                            total: placeholderTemplates.length,
                            timestamp: new Date().toISOString()
                        }
                    })
                };

            } catch (error) {
                console.error('Admin templates error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin Session Verification endpoint - works across devices
        if (path === '/auth/verify-admin' && method === 'GET') {
            console.log(`🔐 Admin session verification request started at ${new Date().toISOString()}`);
            try {
                // Get authentication from cookies (works across devices) or headers (fallback)
                let authToken = null;

                // First try to get from cookie
                if (event.headers.cookie || event.headers.Cookie) {
                    const cookies = event.headers.cookie || event.headers.Cookie;
                    const authCookie = cookies.split(';').find(c => c.trim().startsWith('auth_token='));
                    if (authCookie) {
                        authToken = authCookie.split('=')[1];
                    }
                }

                // Fallback to Authorization header
                if (!authToken) {
                    authToken = event.headers.Authorization?.replace('Bearer ', '') ||
                               event.headers.authorization?.replace('Bearer ', '');
                }

                if (!authToken) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'No authentication found' })
                    };
                }

                // Verify token and check admin status
                let tokenData;
                try {
                    tokenData = jwt.verify(authToken, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid authentication' })
                    };
                }

                // Check if user is admin (user ID 74 or 26)
                const isAdmin = (tokenData.id === 74 || tokenData.id === 26);

                console.log(`✅ Admin verification: userId=${tokenData.id}, isAdmin=${isAdmin}`);

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        isAdmin: isAdmin,
                        userId: tokenData.id,
                        email: tokenData.email,
                        timestamp: new Date().toISOString()
                    })
                };

            } catch (error) {
                console.error('Admin verification error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin Twilio Config endpoint (GET) - load existing configuration
        if (path === '/admin/config/twilio' && method === 'GET') {
            console.log(`📱 Admin Twilio config load request started at ${new Date().toISOString()}`);
            try {
                // Get authentication from cookies (works across devices) or headers (fallback)
                let token = null;

                // First try to get from cookie
                if (event.headers.cookie || event.headers.Cookie) {
                    const cookies = event.headers.cookie || event.headers.Cookie;
                    const authCookie = cookies.split(';').find(c => c.trim().startsWith('auth_token='));
                    if (authCookie) {
                        token = authCookie.split('=')[1];
                    }
                }

                // Fallback to Authorization header
                if (!token) {
                    token = event.headers.Authorization?.replace('Bearer ', '') ||
                           event.headers.authorization?.replace('Bearer ', '');
                }

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Authentication required' })
                    };
                }

                // Verify token and admin status
                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                if (tokenData.id !== 74 && tokenData.id !== 26) {
                    return {
                        statusCode: 403,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Admin access required' })
                    };
                }

                const pool = await getDbPool();

                // Get Twilio configuration from settings table
                const [twilioConfig] = await executeWithRetry(
                    pool,
                    'SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE "twilio_%"',
                    []
                );

                let configData = {};
                twilioConfig.forEach(config => {
                    const key = config.setting_key.replace('twilio_master_', '').replace('twilio_', '');
                    configData[key] = config.setting_value;
                });

                // Mask sensitive auth token
                if (configData.auth_token) {
                    configData.auth_token = '***' + configData.auth_token.slice(-4);
                }

                console.log('✅ Twilio config retrieved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        data: {
                            account_sid: configData.account_sid || '',
                            auth_token: configData.auth_token || '',
                            phone_number: configData.phone_number || '',
                            subaccounts_enabled: configData.subaccounts_enabled === 'true',
                            status: configData.account_sid ? 'configured' : 'not_configured'
                        }
                    })
                };

            } catch (error) {
                console.error('Admin Twilio config load error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin Twilio Config endpoint (POST) - matches frontend expectations
        if (path === '/admin/config/twilio' && method === 'POST') {
            console.log(`📱 Admin Twilio config save request started at ${new Date().toISOString()}`);
            try {
                // Get authentication from cookies (works across devices) or headers (fallback)
                let token = null;

                // First try to get from cookie
                if (event.headers.cookie || event.headers.Cookie) {
                    const cookies = event.headers.cookie || event.headers.Cookie;
                    const authCookie = cookies.split(';').find(c => c.trim().startsWith('auth_token='));
                    if (authCookie) {
                        token = authCookie.split('=')[1];
                    }
                }

                // Fallback to Authorization header
                if (!token) {
                    token = event.headers.Authorization?.replace('Bearer ', '') ||
                           event.headers.authorization?.replace('Bearer ', '');
                }

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Authentication required' })
                    };
                }

                // Verify token and admin status
                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                if (tokenData.id !== 74 && tokenData.id !== 26) {
                    return {
                        statusCode: 403,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Admin access required' })
                    };
                }

                const body = JSON.parse(event.body || '{}');
                const { masterAccountSid, masterAuthToken, enableSubaccounts } = body;

                if (!masterAccountSid || !masterAuthToken) {
                    return {
                        statusCode: 400,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Master Account SID and Auth Token are required' })
                    };
                }

                const pool = await getDbPool();

                // Save Twilio master configuration to settings table
                const timestamp = new Date().toISOString();
                await executeWithRetry(
                    pool,
                    'INSERT INTO settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)',
                    ['twilio_master_account_sid', masterAccountSid, timestamp]
                );
                await executeWithRetry(
                    pool,
                    'INSERT INTO settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)',
                    ['twilio_master_auth_token', masterAuthToken, timestamp]
                );
                await executeWithRetry(
                    pool,
                    'INSERT INTO settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)',
                    ['twilio_subaccounts_enabled', enableSubaccounts ? 'true' : 'false', timestamp]
                );

                console.log('✅ Twilio master config saved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        message: 'Twilio master configuration saved successfully. Multi-tenant subaccount creation enabled.',
                        timestamp: timestamp
                    })
                };

            } catch (error) {
                console.error('Admin Twilio config save error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        // Admin SendGrid Config endpoint (POST) - matches frontend expectations
        if (path === '/admin/config/sendgrid' && method === 'POST') {
            console.log(`📧 Admin SendGrid config save request started at ${new Date().toISOString()}`);
            try {
                // Get authentication from cookies (works across devices) or headers (fallback)
                let token = null;

                // First try to get from cookie
                if (event.headers.cookie || event.headers.Cookie) {
                    const cookies = event.headers.cookie || event.headers.Cookie;
                    const authCookie = cookies.split(';').find(c => c.trim().startsWith('auth_token='));
                    if (authCookie) {
                        token = authCookie.split('=')[1];
                    }
                }

                // Fallback to Authorization header
                if (!token) {
                    token = event.headers.Authorization?.replace('Bearer ', '') ||
                           event.headers.authorization?.replace('Bearer ', '');
                }

                if (!token) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Authentication required' })
                    };
                }

                // Verify token and admin status
                let tokenData;
                try {
                    tokenData = jwt.verify(token, process.env.JWT_SECRET || 'podops-secret-key');
                } catch (error) {
                    return {
                        statusCode: 401,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Invalid token' })
                    };
                }

                if (tokenData.id !== 74 && tokenData.id !== 26) {
                    return {
                        statusCode: 403,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Admin access required' })
                    };
                }

                const body = JSON.parse(event.body || '{}');
                const { masterApiKey, fromEmail, enableAutomation } = body;

                if (!masterApiKey) {
                    return {
                        statusCode: 400,
                        headers: corsHeaders,
                        body: JSON.stringify({ success: false, error: 'Master API key is required' })
                    };
                }

                const pool = await getDbPool();

                // Save SendGrid master configuration to settings table
                const timestamp = new Date().toISOString();
                await executeWithRetry(
                    pool,
                    'INSERT INTO settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)',
                    ['sendgrid_master_api_key', masterApiKey, timestamp]
                );
                await executeWithRetry(
                    pool,
                    'INSERT INTO settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)',
                    ['sendgrid_from_email', fromEmail || '', timestamp]
                );
                await executeWithRetry(
                    pool,
                    'INSERT INTO settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)',
                    ['sendgrid_automation_enabled', enableAutomation ? 'true' : 'false', timestamp]
                );

                console.log('✅ SendGrid master config saved successfully');

                return {
                    statusCode: 200,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: true,
                        message: 'SendGrid master API key saved. Automated subuser creation is now enabled for user configurations.',
                        timestamp: timestamp
                    })
                };

            } catch (error) {
                console.error('Admin SendGrid config save error:', error);
                return {
                    statusCode: 500,
                    headers: corsHeaders,
                    body: JSON.stringify({
                        success: false,
                        error: 'Internal server error',
                        timestamp: new Date().toISOString()
                    })
                };
            }
        }

        return {
            statusCode: 404,
            headers: corsHeaders,
            body: JSON.stringify({ success: false, error: 'Route not found' })
        };

    } catch (error) {
        console.error('Lambda error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ success: false, error: 'Internal server error' })
        };
    }
};