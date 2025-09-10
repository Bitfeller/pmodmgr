const fs = require('fs');
const path = require('path');
const express = require('express');
const crypto = require('crypto');

// ---------------------------------------- CONFIG ---------------------------------------- \\
const allowedHosts = '*';
const listenPath = '/';
const modulesPath = './pkgs/';
const port = 80;
const sessionSize = 16;
const sessionMins = 60;

const updating = false;

// ---------------------------------------- SERVER ---------------------------------------- \\
let pkgs = {};
let rawPwd = '<PASSWORD-REQUIRED-TO-ACCESS>';
let rawAdminPwd = '<ADMIN-PASSWORD>';
let requestMade = false;
let errors = 0;

let sessions = {};

async function indexPkgs() {
    let files = fs.readdirSync(modulesPath)
        .filter(file => !fs.lstatSync(path.join(modulesPath, file)).isDirectory());
    let index = files
        .map(file => fs.readFileSync(path.join(modulesPath, file), 'utf8').split('\n').filter(line => line.startsWith('# ') && line.includes(':')));
    pkgs = {};
    for(let i = 0; i < index.length; i++) {
        let name = index[i].filter(x => x.startsWith('# name: '))[0];
        if(!name)
            continue;
        name = name.split(': ')[1];
        let version = index[i].filter(x => x.startsWith('# version: '))[0];
        if(!version)
            continue;
        version = parseInt(version.split(': ')[1]);
        let desc = index[i].filter(x => x.startsWith('# description: '))[0];
        if(!desc)
            continue;
        desc = desc.split(': ')[1];
        let tags = index[i].filter(x => x.startsWith('# tags: '))[0];
        if(!tags)
            continue;
        tags = tags.split(': ')[1].split(', ');
        pkgs[name] = {
            name,
            desc,
            tags,
            version,
            filename: files[i]
        };
    }
}

function session_valid(sess) {
    if(!sessions[sess])
        return false;
    if(Date.now() - sessions[sess].tick > sessionMins * 60 * 1000) {
        delete sessions[sess];
        return false;
    }
    return true;
}
function admin_session(sess) {
    return sessions[sess].admin == true;
}

function append_to_file(filename, data, time=false) {
    if(typeof data == 'object') {
        let strs = Object.keys(data).map(key => '"' + key + '": "' + data[key] + '"');
        data = '{' + strs.join(', ') + '}';
    }
    let file = fs.readFileSync(filename, 'utf-8');
    file += '\n' + data + (time ? ' [' + Date.now() + ']' : '');
    fs.writeFileSync(filename, file);
}
function error_handler(e) {
    console.log(e);
    errors++;
    append_to_file('./error.log', e, true);
}

let app = express();
let jsonWrapper = express.json();

app.set('trust proxy', true);

app.use((req, res, next) => {
    try {
	return jsonWrapper(req, res, next);
    } catch(e) {
	error_handler(e);
	return next();
    }
});
app.use((req, res, next) => {
    if(allowedHosts == '*') {
        res.setHeader('Access-Control-Allow-Origin', '*');
    } else {
        let origin = req.get('Origin').replaceAll(/http[s]*:\/\//, '').replaceAll(/:[0-9]*/, '');
        if(allowedHosts.includes(origin))
            res.setHeader('Access-Control-Allow-Origin', req.get('Origin'));
    }
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Origin, Content-Type');
    res.header('Access-Control-Allow-Credentials', 'true');
    return next();
});


app.post(listenPath, async (req, res) => {

    append_to_file('./access.log', req.body, true);

    let resolve = (code = 200, data = '') => res.status(code).json({success: 1, data});
    let reject = (code = 400, data = '') => res.status(code).json({success: 0, data});

    let ip = req.ip;

    if(updating)
        return reject(500, 'updating');

    if(!req.body || req.headers['content-type'] !== 'application/json')
        return reject(400, 'bad params');
    
    let body = req.body;
    if(!body.action || typeof body.action !== 'string')
        return reject(400, 'bad params');
    
    let session = body.session;
    let mod = body.mod;

    try {
        switch(body.action) {
            case 'ping':
                if(!requestMade) {
                    requestMade = true;
                    return resolve(200, 'server started');
                }
                if(errors > 0)
                    return resolve(200, `pong [WARNING: ${errors} error(s) since startup]`);
                return resolve(200, 'pong');
            case 'pong':
                return resolve(200, 'ping');
            case 'session':
                let pwd = req.body.pwd;
                if(!pwd || typeof pwd !== 'string')
                    return reject(400, 'bad params');
                if(pwd == rawPwd) {
                    let newSess = crypto.randomBytes(sessionSize).toString('hex');
                    sessions[newSess] = {
                        tick: Date.now(),
                        admin: false
                    };
                    return resolve(200, newSess);
                }
                if(pwd == rawAdminPwd) {
                    let newSess = crypto.randomBytes(sessionSize).toString('hex');
                    sessions[newSess] = {
                        tick: Date.now(),
                        admin: true
                    };
                    return resolve(200, newSess);
                }
                return reject(200, 'bad pwd');
            case 'version':
                if(!session || typeof session !== 'string' || !mod || typeof mod !== 'object')
                    return reject(400, 'bad params');
                if(!session_valid(session))
                    return reject(200, 'bad session')
                let versions = [];
                for(let m of mod) {
                    if(!pkgs[m])
                        return reject(404, 'no mod');
                    if(pkgs[m].version < 1)
                        return reject(400, 'broken');
                    versions.push(String(pkgs[m].version));
                }
                return resolve(200, versions);
            case 'metadata':
                if(!session || typeof session !== 'string' || !mod || typeof mod !== 'object')
                    return reject(400, 'bad params');
                if(!session_valid(session))
                    return reject(200, 'bad session');
                let metadata = [];
                for(let m of mod) {
                    if(!pkgs[m])
                        return reject(404, 'no mod');
                    if(pkgs[m].version < 1)
                        return reject(400, 'broken');
                    metadata.push(pkgs[m]);
                }
                return resolve(200, metadata);
            case 'install':
                if(!session || typeof session !== 'string' || !mod || typeof mod !== 'object')
                    return reject(400, 'bad params');
                if(!session_valid(session))
                    return reject(200, 'bad session');
                let installed = [];
                for(let m of mod) {
                    if(!pkgs[m])
                        return reject(404, 'no mod');
                    if(pkgs[m].version < 1)
                        return reject(400, 'broken');
                    installed.push({meta: pkgs[m], data: fs.readFileSync(path.join(modulesPath, pkgs[m].filename), 'utf8')});
                }
                return resolve(200, installed);
            case 'list':
                if(!session || typeof session !== 'string')
                    return reject(400, 'bad params');
                if(!session_valid(session))
                    return reject(200, 'bad session');
                return resolve(200, pkgs);
            case 'upload':
                let overrideVersion = body.overrideVersion;
                let overrideMod = body.overrideMod;
                if(!session || typeof session !== 'string' || typeof overrideVersion !== 'boolean' || typeof overrideMod !== 'boolean')
                    return reject(400, 'bad params');
                if(!session_valid(session))
                    return reject(403, 'bad session');
                if(pkgs[mod] && !overrideMod)
                    return reject(200, 'cannot override mod');
                
                let data = body.data;
                let filename = body.filename;
                if(!data || typeof data !== 'string' || !filename || typeof filename !== 'string')
                    return reject(400, 'bad params');
    
                if(!overrideVersion) {
                    let version = pkgs[mod] ? pkgs[mod].version + 1 : 1;
                    let lines = data.split('\n');
                    let versionLine = lines.findIndex(line => line.startsWith('# version: '));
                    if(versionLine === -1) {
                        // Add to beginning of array
                        lines.unshift(`# version: ${version}`);
                    } else {
                        lines[versionLine] = `# version: ${version}`;
                    }
                    data = lines.join('\n');
                }
                fs.writeFileSync(path.join(modulesPath, filename), data);
                await indexPkgs();
                return resolve(200, 'done');
            case 'feedback':
                let feedback = body.feedback;
                if(!session || typeof session !== 'string' || !feedback || typeof feedback !== 'string')
                    return reject(400, 'bad params');
                if(!session_valid(session))
                    return reject(200, 'bad session');
                append_to_file('./feedback.log', feedback, true);
                return resolve(200, 'done');
            case 'exit':
                if(!session || typeof session !== 'string')
                    return reject(400, 'bad params');
                if(!session_valid(session))
                    return reject(200, 'bad session');
                delete sessions[session];
                return resolve(200, 'done');
            case 'log':
		let log = body.log;
		if(session && typeof session !== 'string')
		    return reject(400, 'bad params');
		if(!ip)
		    return reject(400, "couldn't get ip");
		if(!log || typeof log !== 'string')
		    return reject(400, 'bad params');
		if(session)
		    fs.writeFileSync('./logs/' + ip + '-' + session + '.log', log);
		else
		    fs.writeFileSync('./logs/' + ip + '.log', log);
		return resolve(200, 'done');
            
            // Admin functionality
            case 'get-connected':
                if(!session || typeof session !== 'string')
                    return reject(400, 'bad params');
                if(!session_valid(session) || !admin_session(session))
                    return reject(200, 'bad session');
                return resolve(200, sessions);
            case 'get-feedback':
                if(!session || typeof session !== 'string')
                    return reject(400, 'bad params');
                if(!session_valid(session) || !admin_session(session))
                    return reject(200, 'bad session');
                return resolve(200, fs.readFileSync('./feedback.log', 'utf-8').split('\n'));
            case 'get-logs':
                if(!session || typeof session !== 'string')
                    return reject(400, 'bad params');
                if(!session_valid(session) || !admin_session(session))
                    return reject(200, 'bad session');
                return resolve(200, fs.readFileSync('./access.log', 'utf-8'));
            case 'get-error-logs':
                if(!session || typeof session !== 'string')
                    return reject(400, 'bad params');
                if(!session_valid(session) || !admin_session(session))
                    return reject(200, 'bad session');
                return resolve(200, fs.readFileSync('./error.log', 'utf-8'));
            case 'raw-list-modules':
                if(!session || typeof session !== 'string')
                    return reject(400, 'bad params');
                if(!session_valid(session) || !admin_session(session))
                    return reject(200, 'bad session');
                return resolve(200, fs.readdirSync(modulesPath));
            
            // Unknown
            default:
                return reject(400, 'bad action');
        }
    } catch(e) {
        error_handler(e);
        return reject(500, 'internal error');
    }
});
app.get(listenPath, async (_, res) => {
    return res.status(200).send('PSS module manager server mirror.');
});

app.listen(port, async () => {
    console.log(`Server started on port ${port}`);
    await indexPkgs();
});
