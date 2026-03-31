import secrets

def generate_secret_key(length=32):
    """
    Generate a cryptographically secure SECRET_KEY.
    Default length: 64 characters.
    """
    return secrets.token_urlsafe(length)

if __name__ == "__main__":
    key = generate_secret_key()
    print("SECRET_KEY =", key)
