# CORE SERVICE  API's

A FastAPI-based REST API for managing personnel, units, and unit-village mappings with JWT authentication.

## Features

- **JWT Authentication** with 60-minute token expiration
- **BCrypt password hashing** for secure password storage
- **MongoDB** integration using Motor (async driver)
- **CRUD operations** for Personnel, Units, and Unit-Villages
- **Soft delete** functionality for all entities
- **RESTful API** design following naming conventions
- **Pydantic schemas** for request/response validation

## Tech Stack

- **FastAPI** - Modern, fast web framework for building APIs
- **MongoDB** - NoSQL database
- **Motor** - Async MongoDB driver
- **JWT** - JSON Web Tokens for authentication
- **BCrypt** - Password hashing
- **Pydantic** - Data validation using Python type annotations

## Project Structure

```
Backend/
├── app/
│   ├── core/
│   │   ├── config.py
│   │   ├── database.py
│   │   └── db_indexes.py           # ✅ Auto-creates indexes on startup
│   ├── models/
│   │   ├── department_model.py     # ✅ NEW
│   │   ├── district_model.py       # ✅ NEW
│   │   ├── rank_master_model.py    # ✅ NEW
│   │   ├── title_master_model.py   # ✅ NEW
│   │   └── unit_type_model.py      # ✅ NEW
│   ├── routers/
│   │   ├── auth_router.py
│   │   ├── personnel_router.py     # ✅ UPDATED with FK validation
│   │   ├── unit_router.py
│   │   └── unit_villages_router.py # ✅ UPDATED with FK & unique validation
│   ├── schemas/
│   │   ├── auth_schema.py
│   │   ├── department_schema.py    # ✅ NEW
│   │   ├── district_schema.py      # ✅ NEW
│   │   ├── personnel_schema.py     # ✅ UPDATED with proper constraints
│   │   ├── rank_master_schema.py   # ✅ NEW
│   │   ├── title_master_schema.py  # ✅ NEW
│   │   ├── unit_schema.py          # ✅ UPDATED with proper constraints
│   │   ├── unit_type_schema.py     # ✅ NEW
│   │   └── unit_villages_schema.py # ✅ UPDATED with proper constraints
│   ├── utils/
│   │   ├── dependencies.py
│   │   ├── security.py
│   │   └── validators.py           # ✅ NEW - FK & constraint validation
│   └── main.py                     # ✅ Application entry point (MOVED INSIDE app/)
├── .env
├── requirements.txt
└── README.md
```

## Setup Instructions

### Prerequisites

- Python 3.10 or higher
- MongoDB 4.4 or higher
- pip (Python package manager)

### Installation

1. **Clone the repository** (or navigate to the project directory)

```bash
cd e:\AI4AP\U2C\Backend
```

2. **Create a virtual environment**

```bash
python -m venv venv
```

3. **Activate the virtual environment**

On Windows:
```bash
venv\Scripts\activate
```

On Linux/Mac:
```bash
source venv/bin/activate
```

4. **Install dependencies**

```bash
pip install -r requirements.txt
```

5. **Configure environment variables**

Edit the `.env` file and update the MongoDB URI:

```env
MONGODB_URI=mongodb://localhost:27017/personnel_db
JWT_SECRET_KEY=your-super-secret-jwt-key-change-this-in-production
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
```

6. **Start MongoDB**

Make sure MongoDB is running on your system. The default connection is:
```
mongodb://localhost:27017
```

7. **Run the application**

```bash
python -m app.main
```

Or using uvicorn directly:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

8. **Access the API**

- API Base URL: http://localhost:8000
- Interactive API Docs (Swagger): http://localhost:8000/docs
- Alternative API Docs (ReDoc): http://localhost:8000/redoc

## API Endpoints

### Authentication

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password"
}
```

Or login with userId:
```json
{
  "userId": "VIJAY-IPS-001",
  "password": "your-password"
}
```

Response:
```json
{
  "accessToken": "eyJhbGc...",
  "tokenType": "bearer",
  "expiresIn": 60
}
```

#### Get Current User Info
```http
GET /api/v1/auth/me
Authorization: Bearer <token>
```

### Personnel

All personnel endpoints require authentication (Bearer token).

#### Create Personnel
```http
POST /api/v1/personnel
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "john.doe@police.gov.in",
  "password": "securePassword123",
  "userId": "JOHN-DOE-001",
  "title": "Mr",
  "firstName": "John",
  "lastName": "Doe",
  "mobile": "+919876543210",
  "badgeNo": "BADGE-001",
  "batchYear": 2020,
  "gender": "Male"
}
```

#### Get Personnel by ID
```http
GET /api/v1/personnel/{personnel_id}
Authorization: Bearer <token>
```

#### Update Personnel
```http
PUT /api/v1/personnel/{personnel_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "John Updated",
  "mobile": "+919876543211"
}
```

#### Delete Personnel (Soft Delete)
```http
DELETE /api/v1/personnel/{personnel_id}
Authorization: Bearer <token>
```

#### Search Personnel
```http
POST /api/v1/personnel/search
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstName": "John",
  "unitId": "507f1f77bcf86cd799439011",
  "skip": 0,
  "limit": 10
}
```

### Units

All unit endpoints require authentication (Bearer token).

#### Create Unit
```http
POST /api/v1/units
Authorization: Bearer <token>
Content-Type: application/json

{
  "policeReferenceId": "UNIT-CR-001",
  "name": "Cyber Crime Cell",
  "address1": "5th Floor, HQ Building",
  "city": "Vijayawada",
  "district": "NTR",
  "zip": "520001",
  "email": "cybercell@ntr-police.gov.in",
  "phone": ["+918001112233"],
  "createdBy": "507f1f77bcf86cd799439011"
}
```

#### Get Unit by ID
```http
GET /api/v1/units/{unit_id}
Authorization: Bearer <token>
```

#### Update Unit
```http
PUT /api/v1/units/{unit_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Cyber Crime Cell",
  "phone": ["+918001112233", "+918001112244"]
}
```

#### Delete Unit (Soft Delete)
```http
DELETE /api/v1/units/{unit_id}
Authorization: Bearer <token>
```

#### Search Units
```http
POST /api/v1/units/search
Authorization: Bearer <token>
Content-Type: application/json

{
  "district": "NTR",
  "skip": 0,
  "limit": 10
}
```

### Unit Villages

All unit-villages endpoints require authentication (Bearer token).

#### Create Unit-Village Mapping
```http
POST /api/v1/unit-villages
Authorization: Bearer <token>
Content-Type: application/json

{
  "unitId": "507f1f77bcf86cd799439011",
  "village": "Gannavaram",
  "mandal": "Gannavaram",
  "district": "NTR",
  "createdBy": "507f1f77bcf86cd799439012"
}
```

#### Get Unit-Village by ID
```http
GET /api/v1/unit-villages/{mapping_id}
Authorization: Bearer <token>
```

#### Update Unit-Village Mapping
```http
PUT /api/v1/unit-villages/{mapping_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "village": "Updated Village Name"
}
```

#### Delete Unit-Village (Soft Delete)
```http
DELETE /api/v1/unit-villages/{mapping_id}
Authorization: Bearer <token>
```

#### Search Unit-Villages
```http
POST /api/v1/unit-villages/search
Authorization: Bearer <token>
Content-Type: application/json

{
  "district": "NTR",
  "mandal": "Gannavaram",
  "skip": 0,
  "limit": 10
}
```

## Data Models

### Personnel Collection

The personnel collection stores user authentication and profile information:

- `email` - Login identifier (unique, lowercase, required)
- `password` - BCrypt hashed password (required)
- `userId` - Police User Identifier (optional, can be used for login)
- `title` - Honorific title (Mr, Ms, etc.)
- `firstName` - Given name
- `lastName` - Surname
- `unitId` - Reference to organizational unit
- `departmentId` - Reference to department
- `rankId` - Reference to rank
- `picture` - Profile image path
- `mobile` - Mobile number
- `batchYear` - Academy/service batch identifier
- `badgeNo` - Officer badge identifier (unique when present)
- `dateOfBirth` - Date of birth
- `gender` - Gender value
- `createdBy`, `createdAt`, `updatedBy`, `updatedAt` - Audit fields
- `isDeleted` - Soft delete flag

### Unit Collection

The unit collection stores organizational unit information:

- `policeReferenceId` - Canonical string code for the unit (unique, required)
- `name` - Name of the organizational unit (required)
- `logo` - Reference to unit's logo
- `address1`, `address2` - Address lines
- `city`, `district`, `zip` - Location information
- `email` - Official email
- `phone` - Array of phone numbers
- `responsibleUserId` - Reference to responsible user
- `responsiblePersonTitle` - Title of responsible person
- `isVirtual` - Virtual unit flag
- `unitTypeId` - Reference to unit type
- `departmentId` - Reference to department
- `proxyUserId` - Reference to proxy user
- `parentUnitId` - Parent unit ID (string reference)
- `parentUnitPath` - Array of ancestor unit IDs
- `unitPersonnelList` - Array of personnel IDs
- `responsibleUserHistory` - Array tracking history of responsible users
- `createdBy`, `createdAt`, `updatedBy`, `updatedAt`, `createdIp`, `updatedIp` - Audit fields
- `isDeleted` - Soft delete flag

### UnitVillages Collection

The unitVillages collection stores unit-village mappings:

- `unitId` - Reference to organizational unit (required)
- `village` - Name of the village (required)
- `mandal` - Name of the mandal/sub-district (required)
- `district` - Name of the district (required)
- `createdBy`, `createdAt`, `updatedBy`, `updatedAt`, `createdIp`, `updatedIp` - Audit fields
- `isDeleted` - Soft delete flag

## Security Features

### Password Security
- Passwords are hashed using BCrypt with per-hash salt
- Plain text passwords are never stored in the database
- Minimum password length: 8 characters

### JWT Authentication
- Token expiration: 60 minutes (configurable)
- Algorithm: HS256
- Token includes: user ID, email, and userId
- All protected endpoints require valid Bearer token

### Soft Delete
- All deletions are soft deletes (isDeleted flag)
- Deleted records are not returned in queries by default
- Data can be restored if needed

## Naming Conventions

The project follows these naming conventions:

### Database
- **Collection names**: snake_case plural (personnel, unit_villages)
- **Document fields**: camelCase (firstName, unitId)
- **Status values**: "draft" | "inReview" | "approved" | "parked" | "superseded"

### Python/FastAPI
- **Files & modules**: snake_case (personnel_router.py)
- **Functions**: snake_case, verb-first (create_personnel)
- **Classes**: PascalCase (PersonnelCreateSchema)
- **Schemas**: XxxCreateSchema, XxxUpdateSchema, XxxSearchSchema
- **Constants**: UPPER_SNAKE_CASE

### APIs
- **Base path**: /api/v1/...
- **Routes**: kebab-case, plural nouns (/api/v1/personnel)
- **Parameters/body**: camelCase

## Development

### Running Tests
```bash
pytest
```

### Code Formatting
```bash
black app/
```

### Linting
```bash
flake8 app/
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| MONGODB_URI | MongoDB connection string | mongodb://localhost:27017/personnel_db |
| JWT_SECRET_KEY | Secret key for JWT token signing | (required - set in production) |
| JWT_ALGORITHM | JWT algorithm | HS256 |
| JWT_ACCESS_TOKEN_EXPIRE_MINUTES | Token expiration time | 60 |
| APP_NAME | Application name | CORE SERVICE  API's |
| APP_VERSION | Application version | 1.0.0 |
| DEBUG | Debug mode | False |

## Troubleshooting

### MongoDB Connection Issues
- Ensure MongoDB is running: `mongod`
- Check MongoDB URI in `.env` file
- Verify firewall settings

### Authentication Issues
- Check if JWT_SECRET_KEY is set in `.env`
- Verify token is included in Authorization header: `Bearer <token>`
- Check if token has expired (60 minutes)

### Import Errors
- Ensure virtual environment is activated
- Run `pip install -r requirements.txt`

## License

This project is proprietary and confidential.

## Support

For issues or questions, please contact the development team.