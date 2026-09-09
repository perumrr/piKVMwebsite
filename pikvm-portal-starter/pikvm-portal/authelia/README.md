# Authelia notes

The main configuration is in `config/configuration.yml`.

The local user database is `config/users.yml`.

Generate the password hash with:

docker run --rm -it authelia/authelia:latest authelia crypto hash generate argon2

Generate the three secret files from the project root:

mkdir -p authelia/secrets

docker run --rm authelia/authelia:latest authelia crypto rand --length 64

Run it three times and save the results as:

authelia/secrets/session_secret.txt
authelia/secrets/storage_encryption_key.txt
authelia/secrets/jwt_secret.txt

Do not commit these files.
