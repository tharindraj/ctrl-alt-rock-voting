const bcrypt = require('bcryptjs');
const dataManager = require('../utils/dataManager');
const auth = require('../middleware/auth');
const notificationService = require('../utils/notificationService');

module.exports = async function (context, req) {
    context.log('Admin function processing request');

    // Apply authentication middleware
    const authResult = await auth(context, req);
    if (authResult.status !== 200) {
        context.res = authResult;
        return;
    }

    // Check admin role
    if (req.user.role !== 'admin') {
        context.res = {
            status: 403,
            body: { message: 'Admin access required' }
        };
        return;
    }

    const resource = req.params.resource;
    const method = req.method.toLowerCase();

    try {
        switch (resource) {
            case 'users':
                return await handleAdminUsers(context, req, method);
            case 'competitions':
                return await handleCompetitions(context, req, method);
            case 'judges':
                return await handleJudges(context, req, method);
            case 'audience':
                return await handleAudience(context, req, method);
            case 'reset-votes':
                return await handleResetVotes(context, req);
            default:
                context.res = {
                    status: 404,
                    body: { message: 'Admin endpoint not found' }
                };
        }
    } catch (error) {
        context.log.error('Admin error:', error);
        context.res = {
            status: 500,
            body: { message: 'Internal server error' }
        };
    }
};

async function handleAdminUsers(context, req, method) {
    switch (method) {
        case 'get':
            return await getAdminUsers(context);
        case 'post':
            return await createAdminUser(context, req);
        case 'put':
            return await updateAdminUser(context, req);
        case 'delete':
            return await deleteAdminUser(context, req);
        default:
            context.res = {
                status: 405,
                body: { message: 'Method not allowed' }
            };
    }
}

async function getAdminUsers(context) {
    try {
        const adminsData = await dataManager.readData('admins');
        const users = adminsData.users.map(user => ({
            id: user.id,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            isSuperAdmin: user.username === 'admin'
        }));
        
        context.res = {
            status: 200,
            body: users
        };
    } catch (error) {
        context.log.error('Get admin users error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to get admin users' }
        };
    }
}

async function createAdminUser(context, req) {
    const { username, firstName, lastName, email } = req.body;

    if (!username || !firstName || !lastName || !email) {
        context.res = {
            status: 400,
            body: { message: 'Username, firstName, lastName, and email are required' }
        };
        return;
    }

    try {
        const adminsData = await dataManager.readData('admins');
        
        // Check if username already exists
        if (adminsData.users.find(u => u.username === username)) {
            context.res = {
                status: 400,
                body: { message: 'Username already exists' }
            };
            return;
        }

        // Generate secure password
        const generatedPassword = generateSecurePassword();
        const hashedPassword = await bcrypt.hash(generatedPassword, 10);

        const newUser = {
            id: Date.now(),
            username,
            firstName,
            lastName,
            email,
            password: hashedPassword
        };

        adminsData.users.push(newUser);
        await dataManager.writeData('admins', adminsData);

        // Send credentials via email
        try {
            await notificationService.sendAdminCredentials(email, firstName, username, generatedPassword);
        } catch (emailError) {
            context.log.error('Email sending failed:', emailError);
            // Continue with success response even if email fails
        }

        context.res = {
            status: 201,
            body: { 
                message: 'Admin user created successfully and credentials sent via email',
                user: {
                    id: newUser.id,
                    username: newUser.username,
                    firstName: newUser.firstName,
                    lastName: newUser.lastName,
                    email: newUser.email
                }
            }
        };
    } catch (error) {
        context.log.error('Create admin user error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to create admin user' }
        };
    }
}

async function updateAdminUser(context, req) {
    const userId = parseInt(req.query.id);
    const { firstName, lastName, email } = req.body;

    if (!userId || !firstName || !lastName || !email) {
        context.res = {
            status: 400,
            body: { message: 'User ID, firstName, lastName, and email are required' }
        };
        return;
    }

    try {
        const adminsData = await dataManager.readData('admins');
        const userIndex = adminsData.users.findIndex(u => u.id === userId);

        if (userIndex === -1) {
            context.res = {
                status: 404,
                body: { message: 'User not found' }
            };
            return;
        }

        // Don't allow editing super admin
        if (adminsData.users[userIndex].username === 'admin') {
            context.res = {
                status: 403,
                body: { message: 'Cannot edit super admin user' }
            };
            return;
        }

        adminsData.users[userIndex] = {
            ...adminsData.users[userIndex],
            firstName,
            lastName,
            email
        };

        await dataManager.writeData('admins', adminsData);

        context.res = {
            status: 200,
            body: { message: 'Admin user updated successfully' }
        };
    } catch (error) {
        context.log.error('Update admin user error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to update admin user' }
        };
    }
}

async function deleteAdminUser(context, req) {
    const userId = parseInt(req.query.id);

    if (!userId) {
        context.res = {
            status: 400,
            body: { message: 'User ID is required' }
        };
        return;
    }

    try {
        const adminsData = await dataManager.readData('admins');
        const userIndex = adminsData.users.findIndex(u => u.id === userId);

        if (userIndex === -1) {
            context.res = {
                status: 404,
                body: { message: 'User not found' }
            };
            return;
        }

        // Don't allow deleting super admin
        if (adminsData.users[userIndex].username === 'admin') {
            context.res = {
                status: 403,
                body: { message: 'Cannot delete super admin user' }
            };
            return;
        }

        adminsData.users.splice(userIndex, 1);
        await dataManager.writeData('admins', adminsData);

        context.res = {
            status: 200,
            body: { message: 'Admin user deleted successfully' }
        };
    } catch (error) {
        context.log.error('Delete admin user error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to delete admin user' }
        };
    }
}

async function handleCompetitions(context, req, method) {
    switch (method) {
        case 'get':
            return await getCompetitions(context);
        case 'post':
            return await createCompetition(context, req);
        case 'put':
            return await updateCompetition(context, req);
        case 'delete':
            return await deleteCompetition(context, req);
        default:
            context.res = {
                status: 405,
                body: { message: 'Method not allowed' }
            };
    }
}

async function getCompetitions(context) {
    try {
        const competitions = await dataManager.readData('competitions');
        context.res = {
            status: 200,
            body: competitions
        };
    } catch (error) {
        context.log.error('Get competitions error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to get competitions' }
        };
    }
}

async function createCompetition(context, req) {
    const { name, description, categories } = req.body;

    if (!name) {
        context.res = {
            status: 400,
            body: { message: 'Competition name is required' }
        };
        return;
    }

    try {
        const competitions = await dataManager.readData('competitions');
        
        const newCompetition = {
            id: Date.now(),
            name,
            description: description || '',
            categories: categories || [],
            createdAt: new Date().toISOString()
        };

        competitions.push(newCompetition);
        await dataManager.writeData('competitions', competitions);

        context.res = {
            status: 201,
            body: { message: 'Competition created successfully', competition: newCompetition }
        };
    } catch (error) {
        context.log.error('Create competition error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to create competition' }
        };
    }
}

async function updateCompetition(context, req) {
    const competitionId = parseInt(req.query.id);
    const { name, description, categories } = req.body;

    if (!competitionId || !name) {
        context.res = {
            status: 400,
            body: { message: 'Competition ID and name are required' }
        };
        return;
    }

    try {
        const competitions = await dataManager.readData('competitions');
        const competitionIndex = competitions.findIndex(c => c.id === competitionId);

        if (competitionIndex === -1) {
            context.res = {
                status: 404,
                body: { message: 'Competition not found' }
            };
            return;
        }

        competitions[competitionIndex] = {
            ...competitions[competitionIndex],
            name,
            description: description || '',
            categories: categories || []
        };

        await dataManager.writeData('competitions', competitions);

        context.res = {
            status: 200,
            body: { message: 'Competition updated successfully' }
        };
    } catch (error) {
        context.log.error('Update competition error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to update competition' }
        };
    }
}

async function deleteCompetition(context, req) {
    const competitionId = parseInt(req.query.id);

    if (!competitionId) {
        context.res = {
            status: 400,
            body: { message: 'Competition ID is required' }
        };
        return;
    }

    try {
        const competitions = await dataManager.readData('competitions');
        const competitionIndex = competitions.findIndex(c => c.id === competitionId);

        if (competitionIndex === -1) {
            context.res = {
                status: 404,
                body: { message: 'Competition not found' }
            };
            return;
        }

        competitions.splice(competitionIndex, 1);
        await dataManager.writeData('competitions', competitions);

        context.res = {
            status: 200,
            body: { message: 'Competition deleted successfully' }
        };
    } catch (error) {
        context.log.error('Delete competition error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to delete competition' }
        };
    }
}

async function handleJudges(context, req, method) {
    // Similar implementation for judges CRUD operations
    context.res = {
        status: 501,
        body: { message: 'Judges management not implemented yet' }
    };
}

async function handleAudience(context, req, method) {
    // Similar implementation for audience CRUD operations  
    context.res = {
        status: 501,
        body: { message: 'Audience management not implemented yet' }
    };
}

async function handleResetVotes(context, req) {
    try {
        // Reset all voting data
        await dataManager.writeData('votes', { audience: [], judges: [] });
        
        context.res = {
            status: 200,
            body: { message: 'All votes have been reset successfully' }
        };
    } catch (error) {
        context.log.error('Reset votes error:', error);
        context.res = {
            status: 500,
            body: { message: 'Failed to reset votes' }
        };
    }
}

function generateSecurePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}