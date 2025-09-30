const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'digitiv-staging.c9ac4atqx0kw.us-east-2.rds.amazonaws.com',
    user: 'digitiv_staging',
    password: 'Podopsmedia123!',
    database: 'digitiv_staging'
};

exports.handler = async (event) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': 'https://www.mypodops.com',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: corsHeaders, body: '{}' };
    }

    try {
        console.log('Testing database connection...');
        const connection = await mysql.createConnection(dbConfig);
        
        const [result] = await connection.execute('SELECT COUNT(*) as count FROM users WHERE email = ?', ['info@podops.app']);
        await connection.end();
        
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                success: true,
                message: 'Database connection successful',
                userCount: result[0].count
            })
        };
    } catch (error) {
        console.error('Database connection failed:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                success: false,
                error: 'Database connection failed',
                details: error.message
            })
        };
    }
};