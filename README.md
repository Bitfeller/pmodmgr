# pmodmgr (problem-set-solver-v2 module manager)
A server-side script to pair with [problem-set-solver-v2](https://github.com/ArrowSlashArrow/problem-set-solver-v2).

Credit to ArrowSlashArrow for the idea of problem-set-solver-v2 (check out the repository for a description).
ArrowSlashArrow is the sole creator of `problem-set-solver-v2`.
Bitfeller is the sole creator of `pmodmgr` (this repository).

Both repositories work together.

Theoretically, while problem-set-solver-v2 is only meant to assist in solving everyday academic problems (such as science, math), the system could be easily generalized to be a module manager where clients can both push and pull modules to run on their system; but since there are no built-in safeguards against new modules, it is advised to implement some kind of moderation system to prevent malicious modules before one attempt this.
The server does require a password however, which means you could theoretically emulate this kind of system between a group of trusted users with the password.

Several notes:
- The server DOES require a password to get a session and use the system. Otherwise, the user will not be allowed in. (The password var can be found in server.js).
- Run `npm install` to install the `express` module before running.
- This script was made on a Node.js v22.19.X interpreter, assuming the `crypto`, `fs`, and `path` modules are built-in.
- This script was running behind a reverse-proxy and therefore only handles HTTP requests. Edit the script to have it handle HTTPS requests if desired. (You'll have to make your own SSL certificate for that as well).
- Clients with the admin password will be able to create an "admin session", where they will be able to do different actions (like get server logs); however, the official client-side UI for the admin session is encrypted behind a password ArrowSlashArrow made on the repository above. (problem-set-solver-v2 was not meant to be initially public, so we didn't account for other servers or other users).
    - Feel free to recreate the admin-side client or ask ArrowSlashArrow for an unencrypted version, and then after setting the admin password, you can use the admin client.
- Make sure to set the proper configuration vars (including the passwords) before executing. (Set the correct path as well).