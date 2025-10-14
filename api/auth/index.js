const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dataManager = require('../utils/dataManager');

module.exports = async function (context, req) {
    context.log('Auth function processing request');

    const action = req.params.action || 'login';
    
    try {
        switch (action) {
            case 'admin':
                return await handleAdminLogin(context, req);
            case 'judge':
                return await handleJudgeLogin(context, req);
            case 'audience':
                return await handleAudienceLogin(context, req);
            case 'verify':
                return await handleTokenVerification(context, req);
            default:
                context.res = {
                    status: 404,
                    body: { message: 'Auth endpoint not found' }
                };
        }
    } catch (error) {
        context.log.error('Auth error:', error);
        context.res = {
            status: 500,
            body: { message: 'Internal server error' }
        };
    }
};

async function handleAdminLogin(context, req) {
    const { username, password } = req.body;

    if (!username || !password) {
        context.res = {
            status: 400,
            body: { message: 'Username and password are required' }
        };
        return;
    }

    try {
        const adminsData = await dataManager.readData('admins');
        const admin = adminsData.users.find(u => u.username === username);

        if (!admin) {
            context.res = {
                status: 401,
                body: { message: 'Invalid credentials' }
            };
            return;
        }

        const isValidPassword = await bcrypt.compare(password, admin.password);
        if (!isValidPassword) {
            context.res = {
                status: 401,
                body: { message: 'Invalid credentials' }
            };
            return;
        }

        const token = jwt.sign(
            { 
                id: admin.id, 
                username: admin.username, 
                role: 'admin',
                isSuperAdmin: admin.username === 'admin'
            },
            process.env.JWT_SECRET || 'fallback-secret',
            { expiresIn: '24h' }
        );

        context.res = {
            status: 200,
            body: {
                message: 'Login successful',
                token,
                user: {
                    id: admin.id,
                    username: admin.username,
                    firstName: admin.firstName,
                    lastName: admin.lastName,
                    email: admin.email,
                    isSuperAdmin: admin.username === 'admin'
                }
            }
        };
    } catch (error) {
        context.log.error('Admin login error:', error);
        context.res = {
            status: 500,
            body: { message: 'Login failed' }
        };
    }
}

async function handleJudgeLogin(context, req) {
    const { email, password } = req.body;

    if (!email || !password) {
        context.res = {
            status: 400,
            body: { message: 'Email and password are required' }
        };
        return;
    }

    try {
        const judgesData = await dataManager.readData('judges');
        const judge = judgesData.find(j => j.email === email);

        if (!judge) {
            context.res = {
                status: 401,
                body: { message: 'Invalid credentials' }
            };
            return;
        }

        const isValidPassword = await bcrypt.compare(password, judge.password);
        if (!isValidPassword) {
            context.res = {
                status: 401,
                body: { message: 'Invalid credentials' }
            };
            return;
        }

        const token = jwt.sign(
            { 
                id: judge.id, 
                email: judge.email, 
                role: 'judge' 
            },
            process.env.JWT_SECRET || 'fallback-secret',
            { expiresIn: '24h' }
        );

        context.res = {
            status: 200,
            body: {
                message: 'Login successful',
                token,
                judge: {
                    id: judge.id,
                    name: judge.name,
                    email: judge.email,
                    expertise: judge.expertise
                }
            }
        };
    } catch (error) {
        context.log.error('Judge login error:', error);
        context.res = {
            status: 500,
            body: { message: 'Login failed' }
        };
    }
}

async function handleAudienceLogin(context, req) {
    const { loginCode } = req.body;

    if (!loginCode) {
        context.res = {
            status: 400,
            body: { message: 'Login code is required' }
        };
        return;
    }

    try {
        const audienceData = await dataManager.readData('audience');
        const audienceMember = audienceData.find(a => a.loginCode === loginCode);

        if (!audienceMember) {
            context.res = {
                status: 401,
                body: { message: 'Invalid login code' }
            };
            return;
        }

        const token = jwt.sign(
            { 
                id: audienceMember.id, 
                loginCode: audienceMember.loginCode, 
                role: 'audience' 
            },
            process.env.JWT_SECRET || 'fallback-secret',
            { expiresIn: '24h' }
        );

        context.res = {
            status: 200,
            body: {
                message: 'Login successful',
                token,
                audience: {
                    id: audienceMember.id,
                    loginCode: audienceMember.loginCode,
                    name: audienceMember.name || 'Audience Member'
                }
            }
        };
    } catch (error) {
        context.log.error('Audience login error:', error);
        context.res = {
            status: 500,
            body: { message: 'Login failed' }
        };
    }
}

async function handleTokenVerification(context, req) {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        context.res = {
            status: 401,
            body: { message: 'No token provided' }
        };
        return;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
        context.res = {
            status: 200,
            body: { 
                message: 'Token valid', 
                user: decoded 
            }
        };
    } catch (error) {
        context.res = {
            status: 401,
            body: { message: 'Invalid token' }
        };
    }
}