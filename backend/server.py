from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Depends, Request, Cookie
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import UpdateOne
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from bson import ObjectId
import os
import uuid
import pandas as pd
import re
import requests
import logging
from io import BytesIO
import hashlib
import secrets
import time
import asyncio
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image as PILImage
from pathlib import Path
from dotenv import load_dotenv
import io
import base64
import json
import openpyxl
from openpyxl.styles import PatternFill

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Upload boyut limiti (Raspberry Pi belleğini büyük dosyalardan koru)
MAX_UPLOAD_BYTES = int(os.environ.get('MAX_UPLOAD_MB', '25')) * 1024 * 1024

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create database indexes for better performance
async def create_indexes():
    """Create database indexes for optimal performance with large datasets"""
    try:
        # Products collection indexes - ENHANCED FOR PERFORMANCE
        await db.products.create_index("name")  # For name search and sorting
        await db.products.create_index("company_id")  # For company filtering
        await db.products.create_index("category_id")  # For category filtering 
        await db.products.create_index("is_favorite")  # For favorites sorting
        await db.products.create_index("brand")  # For brand search
        await db.products.create_index("created_at")  # For date sorting
        
        # PERFORMANCE: Compound indexes for common queries
        await db.products.create_index([("is_favorite", -1), ("name", 1)])  # For favorites-first sorting
        await db.products.create_index([("company_id", 1), ("name", 1)])  # For company-filtered lists
        await db.products.create_index([("category_id", 1), ("name", 1)])  # For category-filtered lists
        await db.products.create_index([("is_favorite", -1), ("company_id", 1), ("name", 1)])  # For complex queries
        await db.products.create_index([("company_id", 1), ("category_id", 1), ("name", 1)])  # For multi-filter queries
        await db.products.create_index([("is_favorite", -1), ("created_at", -1)])  # For favorites + date sorting
        
        # PERFORMANCE: Sparse indexes for optional fields
        await db.products.create_index("list_price_try", sparse=True)
        await db.products.create_index("discounted_price_try", sparse=True)
        
        # Enhanced text search index with weights for better relevance
        try:
            await db.products.create_index(
                [("name", "text"), ("description", "text"), ("brand", "text")],
                weights={"name": 10, "brand": 5, "description": 1},
                name="products_text_search",
            )
        except Exception as _txt_err:
            # Eski/ağırlıksız bir text index varsa (IndexOptionsConflict) onu düşürüp
            # ağırlıklı olanı yeniden oluştur. Arama zaten çalışıyordu; bu iyileştirme.
            logger.warning(f"Text index conflict, yeniden oluşturuluyor: {_txt_err}")
            try:
                existing = await db.products.index_information()
                for idx_name, info in existing.items():
                    if any(field == "_fts" for field, _ in info.get("key", [])):
                        await db.products.drop_index(idx_name)
                await db.products.create_index(
                    [("name", "text"), ("description", "text"), ("brand", "text")],
                    weights={"name": 10, "brand": 5, "description": 1},
                    name="products_text_search",
                )
            except Exception as _txt_err2:
                logger.warning(f"Ağırlıklı text index kurulamadı (mevcut index kullanılacak): {_txt_err2}")
        
        # Companies collection indexes - ENHANCED
        await db.companies.create_index("name")
        await db.companies.create_index("created_at")
        
        # Categories collection indexes - ENHANCED
        await db.categories.create_index("name")
        await db.categories.create_index("sort_order")  # For sorted category lists
        await db.categories.create_index("created_at")
        
        # Category groups collection indexes - ENHANCED
        await db.category_groups.create_index("name")
        await db.category_groups.create_index("sort_order")  # For sorted category group lists
        await db.category_groups.create_index("created_at")
        
        # Quotes collection indexes - PERFORMANCE ENHANCED
        await db.quotes.create_index("customer_name")
        await db.quotes.create_index("created_at")
        await db.quotes.create_index([("status", 1), ("created_at", -1)])  # For status-filtered lists
        await db.quotes.create_index([("customer_name", 1), ("created_at", -1)])  # For customer-filtered lists
        
        # Packages collection indexes - PERFORMANCE ENHANCED
        await db.packages.create_index("name")
        await db.packages.create_index("created_at")
        await db.packages.create_index([("is_pinned", -1), ("created_at", -1)])  # For pinned packages first
        await db.packages.create_index([("name", 1), ("created_at", -1)])  # For name + date sorting
        
        # Package products collection indexes - PERFORMANCE ENHANCED
        await db.package_products.create_index("package_id")
        await db.package_products.create_index("product_id")
        await db.package_products.create_index([("package_id", 1), ("product_id", 1)])  # For efficient lookups
        await db.package_products.create_index([("package_id", 1), ("quantity", -1)])  # For quantity-based queries
        
        # Customers collection indexes - PERFORMANCE ENHANCED
        await db.customers.create_index("name")
        await db.customers.create_index("surname")
        await db.customers.create_index([("name", 1), ("surname", 1)])  # For full name search
        await db.customers.create_index("company")
        await db.customers.create_index("email")
        await db.customers.create_index("phone")
        await db.customers.create_index("is_favorite")
        await db.customers.create_index("created_at")
        await db.customers.create_index([("is_favorite", -1), ("name", 1)])  # For favorites-first sorting

        # Sessions collection - kalici oturum (restart'ta dusmesin)
        await db.sessions.create_index("token", unique=True)
        # TTL: expires_at gecince Mongo otomatik siler (expireAfterSeconds=0 => alandaki zamani kullan)
        await db.sessions.create_index("expires_at", expireAfterSeconds=0)

        # Servis (tadilat/bakim) kayitlari
        await db.services.create_index("created_at")
        await db.services.create_index("status")
        await db.services.create_index("plate")

        # Sozlesmeler
        await db.contracts.create_index("created_at")

        logger.info("PERFORMANCE: Database indexes created successfully")
        
    except Exception as e:
        logger.error(f"Error creating indexes: {e}")
        # Don't fail startup if index creation fails
        pass
        
        logger.info("Enhanced database indexes created successfully for optimal performance")
    except Exception as e:
        logger.error(f"Error creating indexes: {e}")
        # Don't fail startup if indexes can't be created

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management for Raspberry Pi stability"""
    logger.info("Starting application with Raspberry Pi optimizations...")
    
    # Start background scheduler for exchange rate updates
    background_scheduler.start()
    
    # Preload initial exchange rates
    try:
        await currency_service.get_exchange_rates()
        logger.info("Initial exchange rates loaded successfully")
    except Exception as e:
        logger.warning(f"Could not load initial exchange rates: {e}")
    
    # Initialize database indexes and create default categories
    await create_indexes()
    await create_supplies_category()
    await create_default_admin()
    logger.info("Application startup completed")
    yield
    
    # Cleanup on shutdown
    logger.info("Shutting down application...")
    background_scheduler.stop()
    logger.info("Application shutdown completed")

# Create the main app
app = FastAPI(title="Karavan Elektrik Ekipmanları Fiyat Karşılaştırma API", lifespan=lifespan)

# Initialize Sarf Malzemeleri Category
async def create_supplies_category():
    """Create default 'Sarf Malzemeleri' category if it doesn't exist"""
    try:
        # Check if supplies category already exists
        existing_category = await db.categories.find_one({"name": "Sarf Malzemeleri"})
        if not existing_category:
            supplies_category = {
                "id": "sarf-malzemeleri-category",
                "name": "Sarf Malzemeleri",
                "description": "Üretimde kullanılan sarf malzemeleri (tutkal, vida, kablo vb.)",
                "color": "#f97316",  # Orange color
                "created_at": datetime.now(timezone.utc),
                "is_deletable": False  # Prevent deletion
            }
            
            await db.categories.insert_one(supplies_category)
            logger.info("Sarf Malzemeleri category created successfully")
            return True
        else:
            # Update existing category to make it non-deletable
            await db.categories.update_one(
                {"name": "Sarf Malzemeleri"},
                {"$set": {"is_deletable": False, "color": "#f97316"}}
            )
            logger.info("Sarf Malzemeleri category updated to non-deletable")
            return True
    except Exception as e:
        logger.error(f"Error creating supplies category: {e}")
        return False


# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add GZip compression for better performance
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# In-memory cache for performance
cache = {}
CACHE_DURATION = 300  # 5 minutes

# Zamanlama middleware'i.
# NOT: Eski cache mantığı kaldırıldı — route'lar StreamingResponse döndürdüğü için
# response.body okumak ya işe yaramıyordu (cache hiç dolmuyordu) ya da stream'i
# tüketip istemciye BOŞ yanıt gönderme riski taşıyordu (07/05 raporu). Gerçek
# önbellekleme gerekirse fastapi-cache2 gibi test edilmiş bir kütüphane kullanılmalı.
@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    response.headers["X-Response-Time"] = f"{(time.time() - start_time) * 1000:.2f}ms"
    return response

# Cache invalidation utility
def invalidate_cache(pattern: str = None):
    """Invalidate cache entries matching pattern"""
    if pattern is None:
        cache.clear()
        logger.info("All cache cleared")
    else:
        keys_to_remove = [key for key in cache.keys() if pattern in key]
        for key in keys_to_remove:
            del cache[key]
        logger.info(f"Cache cleared for pattern: {pattern}")

# Thread pool for CPU intensive tasks
thread_pool = ThreadPoolExecutor(max_workers=4)

# Pydantic Models
class Company(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CompanyCreate(BaseModel):
    name: str

class Product(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    company_id: str
    category_id: Optional[str] = None
    brand: str = ""  # Marka alanı
    description: Optional[str] = None
    image_url: Optional[str] = None
    list_price: Decimal
    discounted_price: Optional[Decimal] = None
    currency: str
    list_price_try: Optional[Decimal] = None
    discounted_price_try: Optional[Decimal] = None
    is_favorite: bool = False
    stock_quantity: Optional[int] = None  # Sadece favori ürünler için stok takibi
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    company_id: str
    category_id: Optional[str] = None
    brand: str = Field("", max_length=200)  # Yeni marka alanı
    description: Optional[str] = Field(None, max_length=5000)
    image_url: Optional[str] = None
    list_price: Decimal = Field(..., ge=0)
    discounted_price: Optional[Decimal] = Field(None, ge=0)
    currency: str
    is_favorite: bool = False

class Category(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    image_url: Optional[str] = None  # Kategori küçük resmi
    sort_order: int = 0  # Kategori sıralama numarası
    is_deletable: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    color: Optional[str] = None
    image_url: Optional[str] = None  # Kategori küçük resmi
    sort_order: Optional[int] = None  # Yeni kategori için varsayılan sıra

class CategoryGroup(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    color: Optional[str] = "#6B7280"  # Default gray color
    category_ids: List[str] = []  # Bu gruba dahil kategoriler
    sort_order: int = 0  # Kategori grup sıralama numarası
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class CategoryGroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = "#6B7280"
    category_ids: List[str] = []
    sort_order: Optional[int] = 0  # Yeni kategori grubu için varsayılan sıra

class CategoryGroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    category_ids: Optional[List[str]] = None
    sort_order: Optional[int] = None  # Sıralama güncellemesi için

# Customer Models
class Customer(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str  # İsim (zorunlu)
    surname: str  # Soyisim (zorunlu)
    company: Optional[str] = None  # Firma adı (opsiyonel)
    phone: Optional[str] = None  # Telefon (opsiyonel)
    email: Optional[str] = None  # E-posta (opsiyonel)
    address: Optional[str] = None  # Adres (opsiyonel)
    notes: Optional[str] = None  # Notlar (opsiyonel)
    is_favorite: bool = False  # Favori müşteri
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

class CustomerCreate(BaseModel):
    name: str  # İsim (zorunlu)
    surname: str  # Soyisim (zorunlu)
    company: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    is_favorite: bool = False

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    surname: Optional[str] = None
    company: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    is_favorite: Optional[bool] = None

# Upload History Models
class UploadHistory(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    company_name: str
    filename: str
    upload_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    total_products: int
    new_products: int
    updated_products: int
    currency_distribution: Dict[str, int]  # Currency -> count
    price_changes: List[Dict[str, Any]] = []  # Price change details
    status: str = "completed"  # completed, failed, processing

# Package Models
class Package(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    sale_price: Optional[Decimal] = None
    discount_percentage: float = 0  # Paket indirimi
    labor_cost: float = 0  # İşçilik maliyeti
    notes: Optional[str] = None  # Paket notları
    image_url: Optional[str] = None
    is_pinned: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PackageCreate(BaseModel):
    name: str
    description: Optional[str] = None
    sale_price: Optional[Decimal] = None
    discount_percentage: float = 0  # Paket indirimi
    labor_cost: float = 0  # İşçilik maliyeti
    notes: Optional[str] = None  # Paket notları
    image_url: Optional[str] = None
    is_pinned: bool = False

class PackageUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sale_price: Optional[Decimal] = None
    discount_percentage: Optional[float] = None
    labor_cost: Optional[float] = None
    notes: Optional[str] = None
    image_url: Optional[str] = None
    is_pinned: Optional[bool] = None

class PackageProduct(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    package_id: str
    product_id: str
    quantity: int = 1
    custom_price: Optional[Decimal] = None  # Paket içinde özel fiyat (None = orijinal fiyat kullan)
    notes: Optional[str] = None  # Ürün için özel notlar (PDF'de gösterilir)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PackageProductCreate(BaseModel):
    product_id: str
    quantity: int = 1
    custom_price: Optional[Decimal] = None  # Paket içinde özel fiyat
    notes: Optional[str] = None  # Ürün için özel notlar

class PackageProductUpdate(BaseModel):
    quantity: Optional[int] = None
    custom_price: Optional[Decimal] = None  # Paket içinde özel fiyat güncelleme
    notes: Optional[str] = None  # Ürün notları güncelleme

class PackageWithProducts(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    sale_price: Optional[Decimal] = None
    discount_percentage: float = 0  # Paket indirimi
    labor_cost: float = 0  # İşçilik maliyeti
    notes: Optional[str] = None  # Paket notları
    image_url: Optional[str] = None
    created_at: datetime
    products: List[Dict[str, Any]] = []
    supplies: List[Dict[str, Any]] = []  # Sarf malzemeleri
    total_discounted_price: Optional[Decimal] = None
    total_discounted_price_with_supplies: Optional[Decimal] = None
    status: str
class UploadHistoryResponse(BaseModel):
    id: str
    company_id: str
    company_name: str
    filename: str
    upload_date: datetime
    total_products: int
    new_products: int
    updated_products: int
    currency_distribution: Dict[str, int]
    price_changes: List[Dict[str, Any]]
    status: str

class QuoteCreate(BaseModel):
    name: str
    customer_id: Optional[str] = None  # Müşteri ID'si (yeni)
    customer_name: Optional[str] = None  # Backward compatibility
    customer_email: Optional[str] = None  # Backward compatibility
    discount_percentage: float = 0
    labor_cost: float = 0  # İşçilik maliyeti
    products: List[Dict[str, Any]]  # Product objects with ID and quantity
    notes: Optional[str] = None
class PackageSupply(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    package_id: str
    product_id: str
    quantity: int = 1
    note: Optional[str] = None  # Sarf malzemesi notu
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PackageSupplyCreate(BaseModel):
    product_id: str
    quantity: int = 1
    note: Optional[str] = None

class QuoteResponse(BaseModel):
    id: str
    name: str
    customer_id: Optional[str] = None  # Müşteri ID'si (yeni)
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    discount_percentage: float
    labor_cost: float = 0  # İşçilik maliyeti
    total_list_price: float
    total_discounted_price: float 
    total_net_price: float
    products: List[Dict[str, Any]]
    notes: Optional[str] = None
    created_at: str
    status: str = "active"

# ==================== SERVIS (Tadilat/Bakim Takibi) ====================
class ServiceItem(BaseModel):
    name: Optional[str] = Field("", max_length=300)              # Parça/işlem adı
    qty: Optional[float] = Field(1, ge=0)                        # Adet
    unit_price: Optional[float] = Field(0, ge=0)                 # Birim fiyat (₺)

class ServiceRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    order_no: Optional[str] = None                              # İş emri no (otomatik, İŞ-0001)
    customer_name: Optional[str] = Field(None, max_length=200)   # Müşteri adı
    phone: Optional[str] = Field(None, max_length=40)            # Telefon
    vehicle_brand: Optional[str] = Field(None, max_length=100)   # Araç markası
    vehicle_model: Optional[str] = Field(None, max_length=100)   # Araç modeli
    plate: Optional[str] = Field(None, max_length=30)            # Plaka
    is_trailer: Optional[bool] = False                          # Çekme karavan (plakasız)
    arrival_date: Optional[str] = None                           # Geliş/işlem tarihi (YYYY-MM-DD)
    delivery_date: Optional[str] = None                          # Teslim tarihi (boş = henüz teslim edilmedi)
    operations: Optional[str] = Field(None, max_length=5000)     # Yapılan işlemler (serbest metin)
    items: Optional[List[ServiceItem]] = []                      # Yapılandırılmış parça/işlem kalemleri
    photos: Optional[List[str]] = []                            # Fotoğraflar (base64 data URL)
    notes: Optional[str] = Field(None, max_length=5000)          # Notlar
    cost: Optional[float] = Field(None, ge=0)                    # Toplam tutar (kalem yoksa manuel)
    advance_amount: Optional[float] = Field(0, ge=0)            # Alınan avans (₺)
    warranty_months: Optional[int] = Field(None, ge=0)         # Garanti süresi (ay)
    warranty_note: Optional[str] = Field(None, max_length=1000) # Garanti kapsam notu
    status: str = "received"                                     # received | in_progress | delivered
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ServiceCreate(BaseModel):
    customer_name: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=40)
    vehicle_brand: Optional[str] = Field(None, max_length=100)
    vehicle_model: Optional[str] = Field(None, max_length=100)
    plate: Optional[str] = Field(None, max_length=30)
    is_trailer: Optional[bool] = False
    arrival_date: Optional[str] = None
    delivery_date: Optional[str] = None
    operations: Optional[str] = Field(None, max_length=5000)
    items: Optional[List[ServiceItem]] = []
    photos: Optional[List[str]] = []
    notes: Optional[str] = Field(None, max_length=5000)
    cost: Optional[float] = Field(None, ge=0)
    advance_amount: Optional[float] = Field(0, ge=0)
    warranty_months: Optional[int] = Field(None, ge=0)
    warranty_note: Optional[str] = Field(None, max_length=1000)
    status: str = "received"

class ServiceUpdate(BaseModel):
    customer_name: Optional[str] = Field(None, max_length=200)
    phone: Optional[str] = Field(None, max_length=40)
    vehicle_brand: Optional[str] = Field(None, max_length=100)
    vehicle_model: Optional[str] = Field(None, max_length=100)
    plate: Optional[str] = Field(None, max_length=30)
    is_trailer: Optional[bool] = None
    arrival_date: Optional[str] = None
    delivery_date: Optional[str] = None
    operations: Optional[str] = Field(None, max_length=5000)
    items: Optional[List[ServiceItem]] = None
    photos: Optional[List[str]] = None
    notes: Optional[str] = Field(None, max_length=5000)
    cost: Optional[float] = Field(None, ge=0)
    advance_amount: Optional[float] = Field(None, ge=0)
    warranty_months: Optional[int] = Field(None, ge=0)
    warranty_note: Optional[str] = Field(None, max_length=1000)
    status: Optional[str] = None

# ==================== SÖZLEŞMELER (Excel yükle + önizle) ====================
class ContractUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=300)
    customer_name: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=10000)
    data: Optional[Dict[str, Any]] = None  # düzenlenmiş yapısal sözleşme verisi (bölüm/kalem)

class NewContractPayload(BaseModel):
    title: str = Field(..., max_length=300)
    customer_name: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=10000)
    kur: Optional[float] = None


class ExchangeRate(BaseModel):
    currency: str
    rate_to_try: Decimal
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Authentication Models
class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    success: bool
    message: str
    session_token: Optional[str] = None

class User(BaseModel):
    id: str
    username: str
    password_hash: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True

# Currency conversion service - Enhanced for Raspberry Pi stability
class CurrencyService:
    def __init__(self):
        self.api_key = os.environ.get('FREECURRENCY_API_KEY')
        self.api_url = "https://api.freecurrencyapi.com/v1/latest"
        self.rates_cache = {}
        self.last_update = None
        self.cache_duration = 3600  # 1 hour cache
        self.max_retries = 3
        self.retry_delay = 5  # seconds
        self.api_timeout = 30  # Increased for Raspberry Pi
    
    async def get_exchange_rates(self) -> Dict[str, Decimal]:
        """Get current exchange rates with enhanced Raspberry Pi support"""
        
        # Check if cache is still valid (within cache duration)
        if (self.rates_cache and self.last_update and 
            (datetime.now(timezone.utc) - self.last_update).total_seconds() < self.cache_duration):
            logger.info("Using cached exchange rates (still valid)")
            return self.rates_cache
        
        # Try to fetch fresh rates with retry mechanism
        for attempt in range(self.max_retries):
            try:
                logger.info(f"Attempting to fetch exchange rates (attempt {attempt + 1}/{self.max_retries})")
                
                if not self.api_key:
                    raise Exception("FREECURRENCY_API_KEY not found in environment variables")
                
                # Primary attempt: TRY as base currency
                rates = await self._fetch_rates_try_base()
                
                if len(rates) > 1:  # We got valid rates
                    await self._save_rates_to_db(rates)
                    self.rates_cache = rates
                    self.last_update = datetime.now(timezone.utc)
                    logger.info(f"FreeCurrencyAPI exchange rates updated: {rates}")
                    return rates
                
                # Fallback: USD as base currency
                logger.warning("TRY base failed, trying USD base")
                rates = await self._fetch_rates_usd_base()
                
                if len(rates) > 1:  # We got valid rates
                    await self._save_rates_to_db(rates)
                    self.rates_cache = rates
                    self.last_update = datetime.now(timezone.utc)
                    logger.info(f"FreeCurrencyAPI exchange rates updated (USD base): {rates}")
                    return rates
                    
            except Exception as e:
                logger.error(f"Attempt {attempt + 1} failed to fetch exchange rates: {e}")
                
                if attempt < self.max_retries - 1:
                    logger.info(f"Waiting {self.retry_delay} seconds before retry...")
                    await asyncio.sleep(self.retry_delay)
                    self.retry_delay *= 2  # Exponential backoff
                
        # All attempts failed, use fallback strategies
        logger.warning("All API attempts failed, using fallback strategies")
        return await self._get_fallback_rates()
    
    async def _fetch_rates_try_base(self) -> Dict[str, Decimal]:
        """Fetch rates with TRY as base currency"""
        params = {
            'apikey': self.api_key,
            'base_currency': 'TRY',
            'currencies': 'USD,EUR,GBP'
        }
        
        import aiohttp
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=self.api_timeout)) as session:
            async with session.get(self.api_url, params=params) as response:
                response.raise_for_status()
                data = await response.json()
                
                if 'data' not in data:
                    raise Exception(f"Invalid API response format: {data}")
                
                rates_data = data['data']
                rates = {'TRY': Decimal('1')}  # Base currency
                
                for currency, rate_value in rates_data.items():
                    if rate_value and rate_value > 0:
                        try_to_foreign = Decimal(str(rate_value))
                        foreign_to_try = Decimal('1') / try_to_foreign
                        rates[currency] = foreign_to_try
                
                return rates
    
    async def _fetch_rates_usd_base(self) -> Dict[str, Decimal]:
        """Fetch rates with USD as base currency"""
        params = {
            'apikey': self.api_key,
            'base_currency': 'USD', 
            'currencies': 'TRY,EUR,GBP'
        }
        
        import aiohttp
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=self.api_timeout)) as session:
            async with session.get(self.api_url, params=params) as response:
                response.raise_for_status()
                data = await response.json()
                
                if 'data' not in data:
                    raise Exception(f"Invalid API response format: {data}")
                
                rates_data = data['data']
                rates = {'TRY': Decimal('1')}
                
                # USD is base, so TRY rate is direct
                if 'TRY' in rates_data:
                    usd_to_try = Decimal(str(rates_data['TRY']))
                    rates['USD'] = usd_to_try
                
                # For EUR and GBP, convert via USD
                if 'EUR' in rates_data and 'TRY' in rates_data:
                    eur_to_usd = Decimal(str(rates_data['EUR']))
                    usd_to_try = Decimal(str(rates_data['TRY']))
                    eur_to_try = eur_to_usd * usd_to_try
                    rates['EUR'] = eur_to_try
                
                if 'GBP' in rates_data and 'TRY' in rates_data:
                    gbp_to_usd = Decimal(str(rates_data['GBP']))
                    usd_to_try = Decimal(str(rates_data['TRY']))
                    gbp_to_try = gbp_to_usd * usd_to_try
                    rates['GBP'] = gbp_to_try
                
                return rates
    
    async def _save_rates_to_db(self, rates: Dict[str, Decimal]):
        """Save exchange rates to database"""
        try:
            update_time = datetime.now(timezone.utc)
            for currency, rate in rates.items():
                await db.exchange_rates.replace_one(
                    {'currency': currency},
                    {
                        'currency': currency,
                        'rate_to_try': float(rate),
                        'updated_at': update_time
                    },
                    upsert=True
                )
            logger.info("Exchange rates saved to database successfully")
        except Exception as e:
            logger.error(f"Failed to save rates to database: {e}")
    
    async def _get_fallback_rates(self) -> Dict[str, Decimal]:
        """Get fallback exchange rates from database or defaults"""
        try:
            # Try to get from database first
            rates_from_db = await db.exchange_rates.find().to_list(None)
            if rates_from_db:
                fallback_rates = {rate['currency']: Decimal(str(rate['rate_to_try'])) for rate in rates_from_db}
                # Check if DB rates are not too old (max 24 hours)
                if rates_from_db[0].get('updated_at'):
                    last_db_update = rates_from_db[0]['updated_at']
                    if isinstance(last_db_update, str):
                        last_db_update = datetime.fromisoformat(last_db_update.replace('Z', '+00:00'))
                    
                    age_hours = (datetime.now(timezone.utc) - last_db_update).total_seconds() / 3600
                    if age_hours <= 24:  # Use DB rates if less than 24 hours old
                        logger.info(f"Using database fallback rates (age: {age_hours:.1f} hours): {fallback_rates}")
                        return fallback_rates
                
                logger.info(f"Using database fallback rates (old but available): {fallback_rates}")
                return fallback_rates
                
        except Exception as e:
            logger.error(f"Failed to get rates from database: {e}")
        
        # Use cached rates if available
        if self.rates_cache:
            logger.info(f"Using cached fallback rates: {self.rates_cache}")
            return self.rates_cache
        
        # Final default rates
        default_rates = {
            'USD': Decimal('27.5'),
            'EUR': Decimal('30.0'), 
            'TRY': Decimal('1'),
            'GBP': Decimal('35.0')
        }
        logger.warning(f"Using default fallback exchange rates: {default_rates}")
        return default_rates
    
    async def convert_to_try(self, amount: Decimal, from_currency: str) -> Decimal:
        """Convert amount to Turkish Lira"""
        if from_currency.upper() == 'TRY':
            return amount
            
        rates = await self.get_exchange_rates()
        rate = rates.get(from_currency.upper(), Decimal('1'))
        return amount * rate

    async def convert_from_try(self, amount_try: Decimal, to_currency: str) -> Decimal:
        """Convert amount from Turkish Lira to target currency"""
        if to_currency.upper() == 'TRY':
            return amount_try
            
        rates = await self.get_exchange_rates()
        rate = rates.get(to_currency.upper(), Decimal('1'))
        
        # Since rates are TRY to other currency, we need to divide
        if rate > 0:
            return amount_try / rate
        else:
            return amount_try

# Background task scheduler for Raspberry Pi stability
class BackgroundScheduler:
    def __init__(self):
        self.running = False
        self.thread = None
        self.loop = None  # ana event loop referansı (worker thread'den thread-safe gönderim için)

    def start(self):
        """Start background scheduler for Raspberry Pi"""
        if not self.running:
            self.running = True
            # start() lifespan (async context) içinde çağrılır; çalışan ana loop'u yakala.
            try:
                self.loop = asyncio.get_running_loop()
            except RuntimeError:
                self.loop = None
                logger.warning("Background scheduler: çalışan event loop bulunamadı")
            self.thread = threading.Thread(target=self._run_scheduler, daemon=True)
            self.thread.start()
            logger.info("Background scheduler started for Raspberry Pi stability")
    
    def stop(self):
        """Stop background scheduler"""
        self.running = False
        if self.thread:
            self.thread.join()
            logger.info("Background scheduler stopped")
    
    def _run_scheduler(self):
        """Background scheduler loop"""
        import time
        while self.running:
            try:
                # Update exchange rates every 30 minutes — ana loop'a thread-safe gönder
                if self.loop and self.loop.is_running():
                    fut = asyncio.run_coroutine_threadsafe(
                        currency_service.get_exchange_rates(),
                        self.loop,
                    )
                    fut.result(timeout=90)  # tamamlanmayı bekle ki hatalar yakalansın
                    logger.info("Background exchange rate update completed")
                else:
                    logger.warning("Background scheduler: ana event loop yok/çalışmıyor, atlandı")

                # Sleep for 30 minutes
                for _ in range(1800):  # 30 minutes = 1800 seconds
                    if not self.running:
                        break
                    time.sleep(1)

            except Exception as e:
                logger.error(f"Background scheduler error: {e}")
                time.sleep(300)  # Wait 5 minutes on error

# Initialize background scheduler
background_scheduler = BackgroundScheduler()

# Initialize currency service
currency_service = CurrencyService()

# Authentication Service
class AuthService:
    def __init__(self):
        # Oturumlar MongoDB 'sessions' koleksiyonunda saklanir (restart'ta dusmezler).
        # Suresi dolanlari TTL index otomatik siler (bkz. create_database_indexes).
        pass

    def hash_password(self, password: str) -> str:
        """Hash password using SHA-256"""
        return hashlib.sha256(password.encode()).hexdigest()

    def verify_password(self, password: str, password_hash: str) -> bool:
        """Verify password against hash"""
        return self.hash_password(password) == password_hash

    async def create_session(self, username: str) -> str:
        """Create session token (Mongo'da kalici)"""
        session_token = secrets.token_urlsafe(32)
        now = datetime.now(timezone.utc)
        await db.sessions.insert_one({
            'token': session_token,
            'username': username,
            'created_at': now,
            'expires_at': now + timedelta(hours=24)  # 24 saat oturum
        })
        return session_token

    async def validate_session(self, session_token: str) -> Optional[str]:
        """Validate session token and return username if valid"""
        if not session_token:
            return None
        session = await db.sessions.find_one({'token': session_token})
        if not session:
            return None
        expires_at = session.get('expires_at')
        # Mongo'dan gelen datetime tz-naive olabilir; UTC varsay
        if expires_at is not None and expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at is None or datetime.now(timezone.utc) > expires_at:
            # Session expired (TTL index normalde silmis olur; defansif)
            await db.sessions.delete_one({'token': session_token})
            return None
        return session['username']

    async def logout(self, session_token: str) -> bool:
        """Logout user by removing session"""
        result = await db.sessions.delete_one({'token': session_token})
        return result.deleted_count > 0

auth_service = AuthService()

# Create default admin user
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "karavan_admin")

async def create_default_admin():
    """Create or sync the default admin user from the ADMIN_PASSWORD env var.

    The password is no longer hardcoded. If ADMIN_PASSWORD is unset the function
    is a no-op (existing admin, if any, is left untouched — no lockout)."""
    admin_password = os.environ.get("ADMIN_PASSWORD")
    if not admin_password:
        logger.warning("ADMIN_PASSWORD not set in environment; skipping default admin setup")
        return
    try:
        password_hash = auth_service.hash_password(admin_password)
        admin_user = await db.users.find_one({"username": ADMIN_USERNAME})
        if not admin_user:
            admin_user = {
                "id": str(uuid.uuid4()),
                "username": ADMIN_USERNAME,
                "password_hash": password_hash,
                "created_at": datetime.now(timezone.utc),
                "is_active": True
            }
            await db.users.insert_one(admin_user)
            logger.info("Default admin user created successfully")
        elif admin_user.get("password_hash") != password_hash:
            await db.users.update_one(
                {"username": ADMIN_USERNAME},
                {"$set": {"password_hash": password_hash}}
            )
            logger.info("Default admin password synced from environment")
        else:
            logger.info("Default admin user already up to date")
    except Exception as e:
        logger.error(f"Error creating default admin user: {e}")

# Authentication dependency
async def get_current_user(session_token: Optional[str] = Cookie(None)):
    """Get current authenticated user"""
    if not session_token:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    username = await auth_service.validate_session(session_token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    
    return username

# Optional authentication dependency (doesn't require auth but returns user if authenticated)
async def get_current_user_optional(session_token: Optional[str] = Cookie(None)):
    """Get current authenticated user (optional)"""
    if not session_token:
        return None
    
    username = await auth_service.validate_session(session_token)
    return username

# Database helper function
async def get_db():
    """Get database connection"""
    return db

# Color-based Excel parsing service
class ColorBasedExcelService:
    @staticmethod
    def detect_color_category(fill):
        """Detect color category from cell fill"""
        if not fill or not hasattr(fill, 'start_color'):
            return 'NONE'
            
        color = fill.start_color
        
        # RGB renk kontrolü
        if hasattr(color, 'rgb') and color.rgb:
            try:
                rgb = str(color.rgb).upper()
                
                # Debug için
                logger.debug(f"Checking RGB: {rgb}")
                
                # Kırmızı tonları (Ürün Adı) - FFFF0000 formatını kontrol et
                if 'FFFF0000' in rgb or 'FF0000' in rgb or 'CC0000' in rgb:
                    return 'RED'
                # Mavi tonları (Ürün Açıklaması) - özel mavi tonları
                elif 'FF0070C0' in rgb or '0070C0' in rgb or '0000FF' in rgb or '4472C4' in rgb:
                    return 'BLUE'  
                # Turuncu tonları (İndirimli Fiyat) - Önce daha spesifik kontroller
                elif ('FFFFC000' in rgb or 'FFF4B183' in rgb or 'F4B183' in rgb or 'FF7F00' in rgb or 'FFA500' in rgb or 
                      'FF8C00' in rgb or 'FFFF9900' in rgb or 'FF9900' in rgb):
                    return 'ORANGE'
                # Sarı tonları (Firma) - FFFFFF00 formatını kontrol et
                elif 'FFFFFF00' in rgb or 'FFFF00' in rgb or 'FFC000' in rgb:
                    return 'YELLOW'
                # Yeşil tonları (Liste Fiyatı) - FF00B050 formatını kontrol et
                elif 'FF00B050' in rgb or '00B050' in rgb or '00FF00' in rgb or '008000' in rgb:
                    return 'GREEN'
                    
            except Exception as e:
                logger.warning(f"RGB parsing error: {e}")
                
        # Theme color kontrolü (Excel'de theme color kullanıldığında)
        if hasattr(color, 'theme') and color.theme is not None:
            try:
                theme = color.theme
                logger.debug(f"Checking theme color: {theme}")
                
                # Excel theme color mappings
                if theme == 2:  # Theme color 2 genelde koyu kırmızı
                    return 'RED'
                elif theme == 4:  # Theme color 4 genelde mavi
                    return 'BLUE'  
                elif theme == 5:  # Theme color 5 genelde sarı/accent
                    return 'YELLOW'
                elif theme == 6:  # Theme color 6 genelde yeşil
                    return 'GREEN'
                elif theme == 9:  # Theme color 9 - özel durum: hem yeşil hem turuncu olabilir
                    return 'ORANGE'  # Varsayılan turuncu, ama yeşil de olabilir
                elif theme == 7:  # Theme color 7 genelde turuncu
                    return 'ORANGE'
                    
            except Exception as e:
                logger.warning(f"Theme color parsing error: {e}")
                
        # Index renk kontrolü
        if hasattr(color, 'index') and color.index:
            try:
                index = str(color.index)
                logger.debug(f"Checking color index: {index}")
                # Excel'in standart renk indeksleri
                if index in ['10', '3']:  # Kırmızı
                    return 'RED' 
                elif index in ['12', '5']:  # Mavi
                    return 'BLUE'
                elif index in ['13', '6']:  # Sarı
                    return 'YELLOW'
                elif index in ['11', '4']:  # Yeşil
                    return 'GREEN'
                elif index in ['46', '53']:  # Turuncu
                    return 'ORANGE'
                elif index == '9':  # Bu dosyada index 9 İNDİRİMLİ fiyat için kullanılıyor
                    return 'ORANGE'
            except Exception as e:
                logger.warning(f"Index parsing error: {e}")
                
        return 'NONE'
    
    @staticmethod
    def parse_colored_excel(file_content: bytes, company_name: str = "Unknown") -> List[Dict[str, Any]]:
        """Parse Excel file using color-based column detection"""
        try:
            # Load workbook with data_only=True to get formula results
            workbook = openpyxl.load_workbook(io.BytesIO(file_content), data_only=True)
            all_products = []
            
            logger.info(f"Processing Excel with {len(workbook.sheetnames)} sheets: {workbook.sheetnames}")
            
            for sheet_name in workbook.sheetnames:
                logger.info(f"Processing sheet: {sheet_name}")
                sheet = workbook[sheet_name]
                
                # Find header row by looking for colored cells
                header_row = ColorBasedExcelService._find_colored_header_row(sheet)
                if header_row == -1:
                    logger.warning(f"No header found in sheet {sheet_name}, trying to analyze first row as data")
                    # Header yoksa direkt 0. satırı data olarak kabul et ve renkleri analiz et
                    column_mapping = ColorBasedExcelService._analyze_data_row_colors(sheet, 0)
                    if all(val == -1 for val in column_mapping.values()):
                        logger.warning(f"No colored columns found in {sheet_name}, skipping")
                        continue
                    header_row = -1  # Data başlangıcı için -1 kullan
                else:
                    logger.info(f"Found colored header at row {header_row + 1}")
                    # Analyze header colors to map columns
                    column_mapping = ColorBasedExcelService._analyze_header_colors(sheet, header_row)
                
                logger.info(f"Column mapping: {column_mapping}")
                
                # Extract products from this sheet
                sheet_products = ColorBasedExcelService._extract_products_from_sheet(
                    sheet, header_row, column_mapping, company_name
                )
                
                logger.info(f"Extracted {len(sheet_products)} products from {sheet_name}")
                all_products.extend(sheet_products)
            
            logger.info(f"Total products extracted: {len(all_products)}")
            return all_products
            
        except Exception as e:
            logger.error(f"Error in color-based Excel parsing: {e}")
            raise HTTPException(status_code=400, detail=f"Renkli Excel dosyası işlenemedi: {str(e)}")
    
    @staticmethod
    def _find_colored_header_row(sheet) -> int:
        """Find the header row with colored cells"""
        max_search_rows = min(20, sheet.max_row)
        
        for row_idx in range(max_search_rows):
            colored_cells = 0
            non_empty_cells = 0
            meaningful_cells = 0
            
            for col_idx in range(min(10, sheet.max_column)):
                cell = sheet.cell(row=row_idx + 1, column=col_idx + 1)
                if cell.value and str(cell.value).strip():
                    cell_text = str(cell.value).strip().lower()
                    non_empty_cells += 1
                    
                    # Meaningful header words
                    if any(word in cell_text for word in ['ürün', 'ad', 'açık', 'marka', 'firma', 'fiyat', 'price', 'name']):
                        meaningful_cells += 1
                    
                    color_category = ColorBasedExcelService.detect_color_category(cell.fill)
                    logger.debug(f"Row {row_idx + 1}, Col {col_idx + 1}: '{cell_text}' -> {color_category}")
                    if color_category != 'NONE':
                        colored_cells += 1
            
            logger.debug(f"Row {row_idx + 1}: colored={colored_cells}, meaningful={meaningful_cells}, non_empty={non_empty_cells}")
            
            # Header satırında en az 2 renkli hücre ve 2 anlamlı hücre olmalı
            if colored_cells >= 2 and meaningful_cells >= 2:
                return row_idx
        
        # Fallback: Anlamlı kelimeler içeren satırı bul
        for row_idx in range(max_search_rows):
            meaningful_cells = 0
            for col_idx in range(min(10, sheet.max_column)):
                cell = sheet.cell(row=row_idx + 1, column=col_idx + 1)
                if cell.value:
                    cell_text = str(cell.value).strip().lower()
                    if any(word in cell_text for word in ['ürün', 'ad', 'açık', 'marka', 'firma', 'fiyat']):
                        meaningful_cells += 1
            
            if meaningful_cells >= 3:
                return row_idx
                
        return -1
    
    @staticmethod
    def detect_currency_from_header(cell_value: str) -> str:
        """Detect currency from header cell text"""
        if not cell_value:
            return 'TRY'
            
        text = str(cell_value).upper().strip()
        
        # Dolar kontrolüne daha fazla varyant ekle
        dollar_keywords = ['$', 'DOLAR', 'DOLLAR', 'USD', 'DOLAR İSARETİ', 'DOLAR IŞARETI', 'AMERİKAN DOLARI', 'AMERIKAN DOLARI']
        if any(keyword in text for keyword in dollar_keywords):
            return 'USD'
        
        # Euro kontrolüne daha fazla varyant ekle  
        euro_keywords = ['€', 'EURO', 'EUR', 'AVRO', 'AVRUPA']
        if any(keyword in text for keyword in euro_keywords):
            return 'EUR'
        
        # TL kontrolüne daha fazla varyant ekle
        tl_keywords = ['₺', 'TL', 'TRY', 'TÜRK', 'LIRA', 'TÜRK LİRASI', 'TURK LIRASI', 'TURKİYE', 'TURKIYE']
        if any(keyword in text for keyword in tl_keywords):
            return 'TRY'
            
        # Varsayılan olarak TRY
        else:
            return 'TRY'

    @staticmethod
    def _analyze_header_colors(sheet, header_row: int) -> Dict[str, int]:
        """Analyze header colors and map to column purposes - ONLY COLOR-BASED"""
        column_mapping = {
            'product_name': -1,
            'description': -1, 
            'brand': -1,  # Yeni: Sarı = Marka
            'company': -1,
            'list_price': -1,
            'discounted_price': -1,
            'currency': 'TRY'  # Varsayılan döviz
        }
        
        for col_idx in range(min(15, sheet.max_column)):
            cell = sheet.cell(row=header_row + 1, column=col_idx + 1)
            if not cell.value:
                continue
                
            color_category = ColorBasedExcelService.detect_color_category(cell.fill)
            
            # SADECE renk kategorilerine göre kolon belirleme - text-based fallback YOK
            if color_category == 'RED':  # Kırmızı = Ürün Adı
                column_mapping['product_name'] = col_idx
            elif color_category == 'BLUE':  # Mavi = Ürün Açıklaması
                column_mapping['description'] = col_idx
            elif color_category == 'YELLOW':  # Sarı = Marka (eskiden Firma)
                column_mapping['brand'] = col_idx
            elif color_category == 'GREEN':  # Yeşil = Liste Fiyatı
                column_mapping['list_price'] = col_idx
                # Yeşil sütun bulunduğunda döviz algıla
                detected_currency = ColorBasedExcelService.detect_currency_from_header(cell.value)
                column_mapping['currency'] = detected_currency
                logger.info(f"Detected currency from header '{cell.value}': {detected_currency}")
            elif color_category == 'ORANGE':  # Turuncu = İndirimli Fiyat
                column_mapping['discounted_price'] = col_idx
            # Diğer renkler veya renksiz veriler ignore edilir
        
        return column_mapping
    
    @staticmethod
    def _analyze_data_row_colors(sheet, data_row: int) -> Dict[str, int]:
        """Analyze first data row colors when no header is found - ONLY COLOR-BASED"""
        column_mapping = {
            'product_name': -1,
            'description': -1, 
            'brand': -1,  # Yeni: Sarı = Marka
            'company': -1,
            'list_price': -1,
            'discounted_price': -1,
            'currency': 'TRY'  # Header yoksa varsayılan TRY
        }
        
        for col_idx in range(min(15, sheet.max_column)):
            cell = sheet.cell(row=data_row + 1, column=col_idx + 1)
            if not cell.value:
                continue
                
            color_category = ColorBasedExcelService.detect_color_category(cell.fill)
            
            # SADECE renk kategorilerine göre kolon belirleme - text-based fallback YOK
            if color_category == 'RED':  # Kırmızı = Ürün Adı
                column_mapping['product_name'] = col_idx
            elif color_category == 'BLUE':  # Mavi = Ürün Açıklaması  
                column_mapping['description'] = col_idx
            elif color_category == 'YELLOW':  # Sarı = Marka (eskiden Firma)
                column_mapping['brand'] = col_idx
            elif color_category == 'GREEN':  # Yeşil = Liste Fiyatı
                column_mapping['list_price'] = col_idx
                # Header yoksa varsayılan TRY (log için)
                logger.info(f"No header found, using default currency: TRY")
            elif color_category == 'ORANGE':  # Turuncu = İndirimli Fiyat
                column_mapping['discounted_price'] = col_idx
            # Diğer renkler veya renksiz veriler ignore edilir
        
        return column_mapping
    
    @staticmethod
    def _extract_products_from_sheet(sheet, header_row: int, column_mapping: Dict[str, int], company_name: str) -> List[Dict[str, Any]]:
        """Extract products from a sheet using column mapping"""
        import random
        products = []
        
        # Start row hesaplama: header varsa header_row + 1, yoksa 0
        start_row = 0 if header_row == -1 else header_row + 1
        
        # Start from the appropriate row
        for row_idx in range(start_row, sheet.max_row):
            try:
                # Extract data based on column mapping
                product_name = ""
                description = ""
                brand = ""  # Yeni: marka alanı
                detected_company = company_name  # Firma adı Excel yüklerken belirtilen firma
                list_price = 0
                discounted_price = None
                
                # Ürün adı (Kırmızı) - SADECE kırmızı hücre kabul edilir
                if column_mapping['product_name'] >= 0:
                    name_cell = sheet.cell(row=row_idx + 1, column=column_mapping['product_name'] + 1)
                    if (name_cell.value and 
                        ColorBasedExcelService.detect_color_category(name_cell.fill) == 'RED'):
                        product_name = str(name_cell.value).strip()

                # Açıklama (Mavi) - SADECE mavi hücre kabul edilir
                if column_mapping['description'] >= 0:
                    desc_cell = sheet.cell(row=row_idx + 1, column=column_mapping['description'] + 1)
                    if (desc_cell.value and 
                        ColorBasedExcelService.detect_color_category(desc_cell.fill) == 'BLUE'):
                        description = str(desc_cell.value).strip()

                # Marka (Sarı) - SADECE sarı hücre kabul edilir
                if column_mapping['brand'] >= 0:
                    brand_cell = sheet.cell(row=row_idx + 1, column=column_mapping['brand'] + 1)
                    if (brand_cell.value and 
                        ColorBasedExcelService.detect_color_category(brand_cell.fill) == 'YELLOW'):
                        brand_value = str(brand_cell.value).strip()
                        # Excel formülü değilse VE sayısal değer değilse kullan
                        if not brand_value.startswith('='):
                            try:
                                # Sayısal değer mi kontrol et
                                float(brand_value)
                                # Sayısal değerse boş bırak
                                logger.warning(f"Skipping numeric brand name: {brand_value}")
                            except ValueError:
                                # Sayısal değer değilse marka olarak kullan
                                brand = brand_value

                # Liste Fiyatı (Yeşil) - SADECE yeşil hücre kabul edilir
                if column_mapping['list_price'] >= 0:
                    price_cell = sheet.cell(row=row_idx + 1, column=column_mapping['list_price'] + 1)
                    if (price_cell.value and 
                        ColorBasedExcelService.detect_color_category(price_cell.fill) == 'GREEN'):
                        try:
                            list_price = float(str(price_cell.value).replace(',', '.'))
                        except (ValueError, TypeError):
                            list_price = 0

                # İndirimli Fiyat (Turuncu) - SADECE turuncu hücre kabul edilir
                if column_mapping['discounted_price'] >= 0:
                    disc_price_cell = sheet.cell(row=row_idx + 1, column=column_mapping['discounted_price'] + 1)
                    if (disc_price_cell.value and 
                        ColorBasedExcelService.detect_color_category(disc_price_cell.fill) == 'ORANGE'):
                        try:
                            discounted_price = float(str(disc_price_cell.value).replace(',', '.'))
                        except (ValueError, TypeError):
                            discounted_price = None

                # Özel mantık: Turuncu var ama yeşil yoksa
                if discounted_price and discounted_price > 0 and list_price == 0:
                    # İndirimli fiyat üzerine %20-30 arası rastgele zam ekle
                    markup_percentage = random.uniform(20, 30)
                    list_price = discounted_price * (1 + markup_percentage / 100)
                    logger.info(f"Generated list price for {product_name}: {discounted_price} + {markup_percentage:.1f}% = {list_price:.2f}")

                # Geçerli ürün kontrolü - en az liste fiyatı olmalı
                if (product_name and len(product_name) > 3 and 
                    list_price > 0 and 
                    not any(skip_word in product_name.lower() for skip_word in ['no', 'resim', 'ürün adı', 'toplam'])):
                    
                    products.append({
                        'name': product_name,
                        'description': description if description else None,
                        'brand': brand if brand else "",  # Yeni: marka alanı
                        'company_name': detected_company,
                        'list_price': list_price,
                        'discounted_price': discounted_price if discounted_price and discounted_price > 0 else None,
                        'currency': column_mapping.get('currency', 'TRY')  # Algılanan dövizi kullan
                    })
                    
            except Exception as e:
                logger.warning(f"Error processing row {row_idx + 1}: {e}")
                continue
        
        return products

# Excel parsing service
class ExcelService:
    @staticmethod
    def parse_excel_file(file_content: bytes) -> List[Dict[str, Any]]:
        """Parse Excel file and extract product data"""
        try:
            # Read Excel file
            df = pd.read_excel(io.BytesIO(file_content))
            
            logger.info(f"Excel file loaded: {len(df)} rows, {len(df.columns)} columns")
            
            # İlk veri satırını bul (header'ı tespit et)
            header_row = ExcelService._find_header_row(df)
            logger.info(f"Header row found at index: {header_row}")
            
            if header_row == -1:
                # Header bulunamazsa tüm kolonları kontrol et
                products = ExcelService._parse_without_header(df)
            else:
                # Header bulunduysa o satırdan itibaren parse et
                products = ExcelService._parse_with_header(df, header_row)
            
            logger.info(f"Total products extracted: {len(products)}")
            return products
            
        except Exception as e:
            logger.error(f"Error parsing Excel file: {e}")
            raise HTTPException(status_code=400, detail=f"Excel dosyası işlenemedi: {str(e)}")
    
    @staticmethod
    def _find_header_row(df) -> int:
        """Excel dosyasında header satırını bul"""
        # Aranacak header kelimeleri
        header_keywords = [
            # Ürün adı varyantları
            'ürün', 'urun', 'product', 'malzeme', 'güneş', 'panel', 'solar', 'akü', 'batarya',
            'inverter', 'regülatör', 'kablo', 'malzemeler', 'items',
            # Fiyat varyantları  
            'fiyat', 'price', 'liste', 'list', 'tutar', 'amount', 'maliyet', 'cost',
            # İndirim varyantları
            'indirim', 'iskonto', 'discount', 'net', 'indirimli',
            # Para birimi varyantları
            'para', 'currency', 'birim', 'döviz', 'tl', 'usd', 'eur', '$', '€', '₺'
        ]
        
        for row_idx in range(min(20, len(df))):  # İlk 20 satırı kontrol et
            row_text = ""
            for col_idx in range(len(df.columns)):
                cell_value = df.iloc[row_idx, col_idx]
                if pd.notna(cell_value):
                    row_text += str(cell_value).lower() + " "
            
            # Bu satırda header keyword'leri var mı?
            keyword_count = sum(1 for keyword in header_keywords if keyword in row_text)
            if keyword_count >= 2:  # En az 2 keyword varsa header olabilir
                logger.info(f"Header row candidate at {row_idx}: '{row_text[:100]}...'")
                return row_idx
        
        return -1
    
    @staticmethod
    def _parse_with_header(df, header_row: int) -> List[Dict[str, Any]]:
        """Header'lı Excel dosyasını parse et"""
        # Header satırını kullanarak kolonları yeniden adlandır
        df_data = df.iloc[header_row:].copy()
        df_data.columns = df.iloc[header_row]
        df_data = df_data.iloc[1:]  # Header satırını atla
        
        return ExcelService._extract_products_from_dataframe(df_data)
    
    @staticmethod
    def _parse_without_header(df) -> List[Dict[str, Any]]:
        """Header'sız Excel dosyasını parse et"""
        logger.info("Parsing without header, analyzing all columns...")
        
        products = []
        
        # Her satırı kontrol et, veri olan satırları bul
        for row_idx in range(len(df)):
            row_data = {}
            product_name = ""
            list_price = 0
            discounted_price = None
            currency = "USD"  # Default currency
            
            # Bu satırdaki tüm hücreleri kontrol et
            for col_idx in range(len(df.columns)):
                cell_value = df.iloc[row_idx, col_idx]
                
                if pd.notna(cell_value):
                    str_value = str(cell_value).strip()
                    
                    # Fiyat hücresi mi kontrol et (sayısal değer)
                    try:
                        numeric_value = float(str_value.replace(',', '.'))
                        if 1 <= numeric_value <= 100000:  # Makul fiyat aralığı
                            if list_price == 0:
                                list_price = numeric_value
                            elif discounted_price is None and numeric_value < list_price:
                                discounted_price = numeric_value
                    except (ValueError, TypeError):
                        pass
                    
                    # Ürün adı hücresi mi kontrol et (text ve uzun)
                    if len(str_value) > 10 and any(char.isalpha() for char in str_value):
                        if not product_name or len(str_value) > len(product_name):
                            product_name = str_value
                    
                    # Para birimi kontrol et - gelişmiş algılama
                    detected_currency = ExcelService.detect_currency_from_text(str_value, None)
                    if detected_currency:
                        currency = detected_currency
            
            # Geçerli ürün bilgisi var mı kontrol et
            if product_name and list_price > 0:
                products.append({
                    'name': product_name,
                    'list_price': list_price,
                    'currency': currency,
                    'discounted_price': discounted_price
                })
                logger.info(f"Extracted product: {product_name[:50]}... - ${list_price}")
        
        return products
    
    @staticmethod
    def _extract_products_from_dataframe(df) -> List[Dict[str, Any]]:
        """DataFrame'den ürün verilerini çıkar"""
        products = []
        
        # ELEKTROZİRVE formatını kontrol et (basit 4 kolon)
        if len(df.columns) == 4:
            logger.info("Detected ELEKTROZİRVE format (4 columns)")
            return ExcelService._parse_elektrozirve_format(df)
        
        # HAVENSİS formatını kontrol et (karmaşık multi-column)
        elif len(df.columns) > 10:
            logger.info("Detected HAVENSİS format (multi-column)")
            return ExcelService._parse_havensis_format(df)
        
        # Genel format parsing
        else:
            logger.info("Using general format parsing")
            return ExcelService._parse_general_format(df)
    
    @staticmethod
    def _parse_elektrozirve_format(df) -> List[Dict[str, Any]]:
        """ELEKTROZİRVE formatında Excel parse et"""
        products = []
        
        # İlk satır header (Güneş Panelleri, LİSTE FİYATI, İskonto, Net Fiyat)
        df.columns = ['product_name', 'list_price', 'discount_rate', 'net_price']
        
        for index, row in df.iterrows():
            try:
                if index == 0:  # Header satırını atla
                    continue
                
                product_name = str(row['product_name']).strip() if pd.notna(row['product_name']) else ""
                list_price = float(row['list_price']) if pd.notna(row['list_price']) else 0
                net_price = float(row['net_price']) if pd.notna(row['net_price']) else 0
                
                # Kategori başlıkları atla (örn: "Esnek Güneş Panelleri")
                if ('panelleri' in product_name.lower() or 'aküler' in product_name.lower() or 
                    'regülatörler' in product_name.lower()) and list_price == 0:
                    continue
                
                # Geçerli ürün kontrolü
                if (product_name and len(product_name) > 5 and 
                    list_price > 0 and not product_name.lower().startswith('liste')):
                    
                    products.append({
                        'name': product_name,
                        'list_price': list_price,
                        'currency': 'TRY',  # ELEKTROZİRVE TL fiyatları
                        'discounted_price': net_price if net_price != list_price else None
                    })
                    logger.info(f"Added ELEKTROZİRVE product: {product_name[:50]}... - {list_price} TL")
                    
            except Exception as e:
                logger.warning(f"Error processing ELEKTROZİRVE row {index}: {e}")
                continue
        
        return products
    
    @staticmethod
    def _parse_havensis_format(df) -> List[Dict[str, Any]]:
        """HAVENSİS formatında Excel parse et"""
        products = []
        
        # HAVENSİS formatı: Col3=Ürün, Col6=Fiyat$, Col7=İskonto, Col8=İskontolu Fiyat$
        product_col = 3
        price_col = 6
        discount_rate_col = 7
        discounted_price_col = 8
        
        for index, row in df.iterrows():
            try:
                if index < 12:  # İlk 12 satır header/boş satırlar
                    continue
                
                # Ürün adı (Col3)
                product_name = ""
                if len(row) > product_col and pd.notna(row.iloc[product_col]):
                    product_name = str(row.iloc[product_col]).strip()
                
                # Liste fiyatı (Col6)
                list_price = 0
                if len(row) > price_col and pd.notna(row.iloc[price_col]):
                    try:
                        list_price = float(row.iloc[price_col])
                    except (ValueError, TypeError):
                        list_price = 0
                
                # İndirimli fiyat (Col8)
                discounted_price = None
                if len(row) > discounted_price_col and pd.notna(row.iloc[discounted_price_col]):
                    try:
                        discounted_price = float(row.iloc[discounted_price_col])
                    except (ValueError, TypeError):
                        discounted_price = None
                
                # Geçerli ürün kontrolü
                if (product_name and len(product_name) > 10 and 
                    list_price > 0 and 'panel' in product_name.lower()):
                    
                    products.append({
                        'name': product_name,
                        'list_price': list_price,
                        'currency': 'USD',  # HAVENSİS USD fiyatları
                        'discounted_price': discounted_price
                    })
                    logger.info(f"Added HAVENSİS product: {product_name[:50]}... - ${list_price}")
                    
            except Exception as e:
                logger.warning(f"Error processing HAVENSİS row {index}: {e}")
                continue
        
        return products
    
    @staticmethod
    def detect_currency_from_text(text: str, fallback_currency: str = 'USD') -> str:
        """Detect currency from any text (header, cell value, etc.)"""
        if not text:
            return fallback_currency
            
        text = str(text).upper().strip()
        
        # Dolar kontrolü - gelişmiş
        dollar_keywords = ['$', 'DOLAR', 'DOLLAR', 'USD', 'DOLAR İSARETİ', 'DOLAR IŞARETI', 'AMERİKAN DOLARI', 'AMERIKAN DOLARI']
        if any(keyword in text for keyword in dollar_keywords):
            return 'USD'
        
        # Euro kontrolü - gelişmiş
        euro_keywords = ['€', 'EURO', 'EUR', 'AVRO', 'AVRUPA']
        if any(keyword in text for keyword in euro_keywords):
            return 'EUR'
        
        # TL kontrolü - gelişmiş
        tl_keywords = ['₺', 'TL', 'TRY', 'TÜRK', 'LIRA', 'TÜRK LİRASI', 'TURK LIRASI', 'TURKİYE', 'TURKIYE']
        if any(keyword in text for keyword in tl_keywords):
            return 'TRY'
            
        return fallback_currency

    @staticmethod
    def _parse_general_format(df) -> List[Dict[str, Any]]:
        """Genel format parsing"""
        products = []
        
        # Gelişmiş kolon mapping
        column_mapping = {
            # Ürün adı varyantları
            'ürün adı': 'product_name', 'urun adi': 'product_name', 'product name': 'product_name',
            'ürün': 'product_name', 'urun': 'product_name', 'product': 'product_name',
            'malzeme': 'product_name', 'malzemeler': 'product_name', 'item': 'product_name',
            'güneş panelleri': 'product_name', 'gunes panelleri': 'product_name',
            'solar panel': 'product_name', 'panel': 'product_name',
            'aküler': 'product_name', 'akü': 'product_name', 'batarya': 'product_name',
            'ad': 'product_name', 'name': 'product_name',
            
            # Marka varyantları (yeni)
            'marka': 'brand', 'brand': 'brand', 'markalar': 'brand', 'brands': 'brand',
            'üretici': 'brand', 'uretici': 'brand', 'manufacturer': 'brand',
            'yapimci': 'brand', 'yapımcı': 'brand', 'maker': 'brand',
            
            # Liste fiyatı varyantları
            'liste fiyatı': 'list_price', 'liste fiyati': 'list_price', 'list price': 'list_price',
            'fiyat$': 'list_price', 'fiyat $': 'list_price', 'fiyat': 'list_price',
            'liste': 'list_price', 'list': 'list_price', 'price': 'list_price',
            'tutar': 'list_price', 'amount': 'list_price', 'maliyet': 'list_price',
            
            # İndirimli fiyat varyantları
            'indirimli fiyat $': 'discounted_price', 'indirimli fiyat$': 'discounted_price',
            'iskontolu fiyat $': 'discounted_price', 'iskontolu fiyat$': 'discounted_price',
            'indirimli fiyat': 'discounted_price', 'indirimli fiyati': 'discounted_price',
            'iskontolu fiyat': 'discounted_price', 'iskontolu fiyati': 'discounted_price',
            'net fiyat': 'discounted_price', 'net price': 'discounted_price',
            'discounted price': 'discounted_price', 'discount price': 'discounted_price',
            'net': 'discounted_price', 'indirim': 'discounted_price', 'iskonto': 'discounted_price',
            
            # Para birimi varyantları
            'para birimi': 'currency', 'currency': 'currency', 'birim': 'currency',
            'döviz': 'currency', 'doviz': 'currency'
        }
        
        # Kolonları normalize et
        df.columns = df.columns.astype(str).str.lower().str.strip()
        logger.info(f"Normalized columns: {list(df.columns)}")
        
        # Kolon mapping uygula
        for col in df.columns:
            for mapping_key, mapping_value in column_mapping.items():
                if mapping_key in col:
                    df = df.rename(columns={col: mapping_value})
                    logger.info(f"Mapped column '{col}' to '{mapping_value}'")
                    break
        
        logger.info(f"Final mapped columns: {list(df.columns)}")
        
        # Eğer standart kolonlar yoksa, konum bazlı mapping dene
        if 'product_name' not in df.columns:
            # İlk metin kolonu ürün adı olabilir
            for col in df.columns:
                if df[col].dtype == 'object':
                    df = df.rename(columns={col: 'product_name'})
                    logger.info(f"Using first text column '{col}' as product_name")
                    break
        
        if 'list_price' not in df.columns:
            # İlk sayısal kolon liste fiyatı olabilir  
            for col in df.columns:
                if col != 'product_name' and pd.api.types.is_numeric_dtype(df[col]):
                    df = df.rename(columns={col: 'list_price'})
                    logger.info(f"Using first numeric column '{col}' as list_price")
                    break
        
        # Ürünleri çıkar
        for index, row in df.iterrows():
            try:
                # Ürün adı
                product_name = ""
                if 'product_name' in row:
                    product_name = str(row['product_name']).strip() if pd.notna(row['product_name']) else ""
                
                # Marka (yeni)
                brand = ""
                if 'brand' in row and pd.notna(row['brand']):
                    brand = str(row['brand']).strip()
                
                # Liste fiyatı
                list_price = 0
                if 'list_price' in row:
                    try:
                        list_price = float(row['list_price']) if pd.notna(row['list_price']) else 0
                    except (ValueError, TypeError):
                        list_price = 0
                
                # İndirimli fiyat
                discounted_price = None
                if 'discounted_price' in row and pd.notna(row['discounted_price']):
                    try:
                        discounted_price = float(row['discounted_price'])
                    except (ValueError, TypeError):
                        discounted_price = None
                
                # Para birimi algılama - gelişmiş
                currency = "USD"  # varsayılan
                
                # Önce currency sütunu varsa onu kullan
                if 'currency' in row and pd.notna(row['currency']):
                    detected = ExcelService.detect_currency_from_text(str(row['currency']))
                    if detected:
                        currency = detected
                
                # Tüm sütunlarda para birimi işaretçilerini ara
                for col_name, col_value in row.items():
                    if pd.notna(col_value):
                        cell_text = str(col_value)
                        detected = ExcelService.detect_currency_from_text(cell_text, None)
                        if detected:
                            currency = detected
                            break
                
                # Sütun başlıklarında da para birimi ara
                for col_name in df.columns:
                    detected = ExcelService.detect_currency_from_text(str(col_name), None)
                    if detected:
                        currency = detected
                        break
                
                # Geçerli ürün kontrolü
                if product_name and len(product_name) > 3 and list_price > 0:
                    product = {
                        'name': product_name,
                        'brand': brand,  # Yeni: marka alanı
                        'list_price': list_price,
                        'currency': currency,
                        'discounted_price': discounted_price
                    }
                    products.append(product)
                    logger.info(f"Added product: {product_name[:50]}... - {list_price} {currency}")
                else:
                    logger.info(f"Skipped row {index}: name='{product_name}', price={list_price}")
                    
            except Exception as e:
                logger.warning(f"Error processing row {index}: {e}")
                continue
        
        return products

excel_service = ExcelService()

# API Routes

@api_router.get("/")
async def root():
    return {"message": "Karavan Elektrik Ekipmanları Fiyat Karşılaştırma API"}

@api_router.get("/exchange-rates")
async def get_exchange_rates():
    """Get current exchange rates"""
    try:
        rates = await currency_service.get_exchange_rates()
        return {
            "success": True,
            "rates": {k: float(v) for k, v in rates.items()},
            "updated_at": currency_service.last_update.isoformat() if currency_service.last_update else None
        }
    except Exception as e:
        logger.error(f"Error getting exchange rates: {e}")
        raise HTTPException(status_code=500, detail="Döviz kurları alınamadı")

@api_router.post("/exchange-rates/update")
async def update_exchange_rates():
    """Force update exchange rates from API and recalculate all product TRY prices"""
    try:
        # Clear cache to force fresh API call
        currency_service.rates_cache = {}
        currency_service.last_update = None
        
        rates = await currency_service.get_exchange_rates()
        
        # Recalculate all products' TRY prices using the new rates
        updated_count = 0
        recalculation_error = None
        try:
            # Fetch all products (only fields we need)
            products_cursor = db.products.find(
                {},
                {"id": 1, "list_price": 1, "discounted_price": 1, "currency": 1}
            )
            
            bulk_ops = []
            async for product in products_cursor:
                currency = (product.get("currency") or "TRY").upper()
                list_price_raw = product.get("list_price") or 0
                discounted_price_raw = product.get("discounted_price")
                
                try:
                    list_price_dec = Decimal(str(list_price_raw))
                except Exception:
                    list_price_dec = Decimal("0")
                
                # Convert list price
                if currency == "TRY":
                    list_price_try = list_price_dec
                else:
                    rate = rates.get(currency, Decimal("1"))
                    list_price_try = list_price_dec * rate
                
                update_set = {"list_price_try": float(list_price_try)}
                
                # Convert discounted price (if present)
                if discounted_price_raw is not None:
                    try:
                        discounted_price_dec = Decimal(str(discounted_price_raw))
                    except Exception:
                        discounted_price_dec = None
                    
                    if discounted_price_dec is not None:
                        if currency == "TRY":
                            discounted_price_try = discounted_price_dec
                        else:
                            rate = rates.get(currency, Decimal("1"))
                            discounted_price_try = discounted_price_dec * rate
                        update_set["discounted_price_try"] = float(discounted_price_try)
                    else:
                        update_set["discounted_price_try"] = None
                else:
                    update_set["discounted_price_try"] = None
                
                bulk_ops.append(
                    UpdateOne({"id": product["id"]}, {"$set": update_set})
                )
                
                # Flush in batches to avoid huge memory usage
                if len(bulk_ops) >= 500:
                    result = await db.products.bulk_write(bulk_ops, ordered=False)
                    updated_count += result.modified_count
                    bulk_ops = []
            
            if bulk_ops:
                result = await db.products.bulk_write(bulk_ops, ordered=False)
                updated_count += result.modified_count
            
            logger.info(f"Recalculated TRY prices for {updated_count} products with new exchange rates")
        except Exception as e:
            # Capture (do not silently swallow) the recalculation error so the
            # caller can tell the difference between "rates didn't move" and
            # "something actually broke". The request still returns 200 so the
            # rate display keeps working.
            recalculation_error = str(e)
            logger.error(f"Error recalculating product TRY prices: {e}")

        # Clear the in-memory response cache so any future cached product lists
        # reflect the new prices. (The cache middleware is currently effectively a
        # no-op, but this keeps correctness if/when it is repaired.)
        invalidate_cache()

        # Did these rates come from a live API fetch, or a stale/fallback set?
        # get_exchange_rates() only sets last_update on a successful live fetch; on
        # fallback (API down, quota exceeded, or a market holiday) it stays None.
        # This lets the UI say "live rates applied" vs "market closed, used last
        # known rates" instead of a misleading generic success message.
        rates_are_live = currency_service.last_update is not None

        if recalculation_error is not None:
            message = f"Kurlar alındı ancak ürün fiyatları hesaplanırken hata oluştu: {recalculation_error}"
        elif not rates_are_live:
            message = (f"Canlı kur alınamadı (piyasa kapalı veya API erişilemez olabilir); "
                       f"son bilinen kurlarla {updated_count} ürünün TL fiyatı korundu/hesaplandı")
        else:
            message = f"Döviz kurları güncellendi: {updated_count} ürünün TL fiyatı yeniden hesaplandı"

        return {
            "success": recalculation_error is None,
            "rates_live": rates_are_live,
            "message": message,
            "rates": {k: float(v) for k, v in rates.items()},
            "updated_products_count": updated_count,
            "recalculation_error": recalculation_error,
            "updated_at": currency_service.last_update.isoformat() if currency_service.last_update else None
        }
    except Exception as e:
        logger.error(f"Error updating exchange rates: {e}")
        raise HTTPException(status_code=500, detail="Döviz kurları güncellenemedi")

@api_router.post("/companies", response_model=Company)
async def create_company(company: CompanyCreate):
    """Create a new company"""
    try:
        company_dict = {
            "id": str(uuid.uuid4()),
            "name": company.name,
            "created_at": datetime.now(timezone.utc)
        }
        
        result = await db.companies.insert_one(company_dict)
        return Company(**company_dict)
        
    except Exception as e:
        logger.error(f"Error creating company: {e}")
        raise HTTPException(status_code=500, detail="Firma oluşturulamadı")

@api_router.get("/companies", response_model=List[Company])
async def get_companies():
    """Get all companies"""
    try:
        companies = await db.companies.find().to_list(None)
        return [Company(**company) for company in companies]
    except Exception as e:
        logger.error(f"Error getting companies: {e}")
        raise HTTPException(status_code=500, detail="Firmalar getirilemedi")

@api_router.delete("/companies/{company_id}")
async def delete_company(company_id: str):
    """Delete a company"""
    try:
        result = await db.companies.delete_one({"id": company_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Firma bulunamadı")
        
        # Also delete all products of this company
        await db.products.delete_many({"company_id": company_id})
        
        return {"success": True, "message": "Firma silindi"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting company: {e}")
        raise HTTPException(status_code=500, detail="Firma silinemedi")

# ===========================
# CUSTOMER ENDPOINTS
# ===========================

@api_router.post("/customers", response_model=Customer)
async def create_customer(customer: CustomerCreate):
    """Create a new customer"""
    try:
        customer_dict = customer.dict()
        customer_dict["id"] = str(uuid.uuid4())
        customer_dict["created_at"] = datetime.now(timezone.utc)
        customer_dict["updated_at"] = None
        
        await db.customers.insert_one(customer_dict)
        
        return Customer(**customer_dict)
    except Exception as e:
        logger.error(f"Error creating customer: {e}")
        raise HTTPException(status_code=500, detail="Müşteri oluşturulamadı")

@api_router.get("/customers", response_model=List[Customer])
async def get_customers(
    is_favorite: Optional[bool] = None,
    search: Optional[str] = None
):
    """Get all customers with optional filtering"""
    try:
        query = {}
        
        if is_favorite is not None:
            query["is_favorite"] = is_favorite
        
        if search:
            # Search in name, surname, company, email, phone
            search_regex = {"$regex": search, "$options": "i"}
            query["$or"] = [
                {"name": search_regex},
                {"surname": search_regex},
                {"company": search_regex},
                {"email": search_regex},
                {"phone": search_regex}
            ]
        
        # Sort: favorites first, then by name
        customers = await db.customers.find(query).sort([("is_favorite", -1), ("name", 1), ("surname", 1)]).to_list(None)
        
        return [Customer(**customer) for customer in customers]
    except Exception as e:
        logger.error(f"Error getting customers: {e}")
        raise HTTPException(status_code=500, detail="Müşteriler getirilemedi")

@api_router.get("/customers/{customer_id}", response_model=Customer)
async def get_customer(customer_id: str):
    """Get a single customer by ID"""
    try:
        customer = await db.customers.find_one({"id": customer_id})
        if not customer:
            raise HTTPException(status_code=404, detail="Müşteri bulunamadı")
        
        return Customer(**customer)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting customer: {e}")
        raise HTTPException(status_code=500, detail="Müşteri getirilemedi")

@api_router.put("/customers/{customer_id}", response_model=Customer)
async def update_customer(customer_id: str, customer_update: CustomerUpdate):
    """Update a customer"""
    try:
        # Get existing customer
        existing_customer = await db.customers.find_one({"id": customer_id})
        if not existing_customer:
            raise HTTPException(status_code=404, detail="Müşteri bulunamadı")
        
        # Prepare update data
        update_dict = {}
        if customer_update.name is not None:
            update_dict["name"] = customer_update.name
        if customer_update.surname is not None:
            update_dict["surname"] = customer_update.surname
        if customer_update.company is not None:
            update_dict["company"] = customer_update.company
        if customer_update.phone is not None:
            update_dict["phone"] = customer_update.phone
        if customer_update.email is not None:
            update_dict["email"] = customer_update.email
        if customer_update.address is not None:
            update_dict["address"] = customer_update.address
        if customer_update.notes is not None:
            update_dict["notes"] = customer_update.notes
        if customer_update.is_favorite is not None:
            update_dict["is_favorite"] = customer_update.is_favorite
        
        if not update_dict:
            raise HTTPException(status_code=400, detail="Güncellenecek veri bulunamadı")
        
        # Add updated timestamp
        update_dict["updated_at"] = datetime.now(timezone.utc)
        
        # Update customer
        await db.customers.update_one(
            {"id": customer_id},
            {"$set": update_dict}
        )
        
        # Get updated customer
        updated_customer = await db.customers.find_one({"id": customer_id})
        
        return Customer(**updated_customer)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating customer: {e}")
        raise HTTPException(status_code=500, detail="Müşteri güncellenemedi")

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str):
    """Delete a customer"""
    try:
        result = await db.customers.delete_one({"id": customer_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Müşteri bulunamadı")
        
        return {"success": True, "message": "Müşteri silindi"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting customer: {e}")
        raise HTTPException(status_code=500, detail="Müşteri silinemedi")

@api_router.patch("/customers/{customer_id}/favorite")
async def toggle_customer_favorite(customer_id: str):
    """Toggle customer favorite status"""
    try:
        customer = await db.customers.find_one({"id": customer_id})
        if not customer:
            raise HTTPException(status_code=404, detail="Müşteri bulunamadı")
        
        new_favorite_status = not customer.get("is_favorite", False)
        
        await db.customers.update_one(
            {"id": customer_id},
            {"$set": {
                "is_favorite": new_favorite_status,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        return {
            "success": True,
            "is_favorite": new_favorite_status,
            "message": "Favori silindi" if not new_favorite_status else "Favorilere eklendi"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling customer favorite: {e}")
        raise HTTPException(status_code=500, detail="Favori durumu güncellenemedi")

@api_router.get("/customers/{customer_id}/quotes")
async def get_customer_quotes(customer_id: str):
    """Get all quotes for a specific customer"""
    try:
        # Verify customer exists
        customer = await db.customers.find_one({"id": customer_id})
        if not customer:
            raise HTTPException(status_code=404, detail="Müşteri bulunamadı")
        
        # Get quotes for this customer
        quotes = await db.quotes.find({"customer_id": customer_id}).sort("created_at", -1).to_list(None)
        
        return {
            "success": True,
            "customer": Customer(**customer).dict(),
            "quotes": quotes,
            "total_quotes": len(quotes)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting customer quotes: {e}")
        raise HTTPException(status_code=500, detail="Müşteri teklifleri getirilemedi")

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None  # Marka alanı
    company_id: Optional[str] = None  # Firma alanı
    description: Optional[str] = None
    image_url: Optional[str] = None
    list_price: Optional[Decimal] = None
    discounted_price: Optional[Decimal] = None
    currency: Optional[str] = None
    category_id: Optional[str] = None

@api_router.patch("/products/{product_id}")
async def update_product(product_id: str, update_data: ProductUpdate):
    """Update a product"""
    try:
        # Get existing product
        existing_product = await db.products.find_one({"id": product_id})
        if not existing_product:
            raise HTTPException(status_code=404, detail="Ürün bulunamadı")
        
        # Prepare update data
        update_dict = {}
        if update_data.name is not None:
            update_dict["name"] = update_data.name
        if update_data.brand is not None:
            update_dict["brand"] = update_data.brand
        if update_data.company_id is not None:
            update_dict["company_id"] = update_data.company_id
        if update_data.description is not None:
            update_dict["description"] = update_data.description
        if update_data.image_url is not None:
            update_dict["image_url"] = update_data.image_url
        if update_data.list_price is not None:
            update_dict["list_price"] = float(update_data.list_price)
        if update_data.discounted_price is not None:
            update_dict["discounted_price"] = float(update_data.discounted_price)
        if update_data.currency is not None:
            update_dict["currency"] = update_data.currency.upper()
        if update_data.category_id is not None:
            update_dict["category_id"] = update_data.category_id
        
        # If currency or prices changed, recalculate TRY prices
        if update_data.currency is not None or update_data.list_price is not None or update_data.discounted_price is not None:
            currency = update_data.currency.upper() if update_data.currency else existing_product["currency"]
            list_price = float(update_data.list_price) if update_data.list_price is not None else existing_product["list_price"]
            discounted_price = float(update_data.discounted_price) if update_data.discounted_price is not None else existing_product.get("discounted_price")
            
            # Convert to TRY
            try:
                list_price_try = await currency_service.convert_to_try(Decimal(str(list_price)), currency)
                update_dict["list_price_try"] = float(list_price_try)
            except Exception as e:
                logger.warning(f"Failed to convert list price to TRY: {e}")
                update_dict["list_price_try"] = float(list_price)
            
            if discounted_price is not None:
                try:
                    discounted_price_try = await currency_service.convert_to_try(Decimal(str(discounted_price)), currency)
                    update_dict["discounted_price_try"] = float(discounted_price_try)
                except Exception as e:
                    logger.warning(f"Failed to convert discounted price to TRY: {e}")
                    update_dict["discounted_price_try"] = float(discounted_price)
            else:
                update_dict["discounted_price_try"] = None
        
        # Update product
        if update_dict:
            result = await db.products.update_one(
                {"id": product_id},
                {"$set": update_dict}
            )
            
            if result.modified_count == 0:
                raise HTTPException(status_code=404, detail="Ürün güncellenemedi")
        
        # Get updated product
        updated_product = await db.products.find_one({"id": product_id})
        return {
            "success": True,
            "message": "Ürün başarıyla güncellendi",
            "product": Product(**updated_product)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating product: {e}")
        raise HTTPException(status_code=500, detail="Ürün güncellenemedi")

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    """Delete a product"""
    try:
        result = await db.products.delete_one({"id": product_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Ürün bulunamadı")
        
        return {"success": True, "message": "Ürün silindi"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting product: {e}")
        raise HTTPException(status_code=500, detail="Ürün silinemedi")

@api_router.put("/products/{product_id}")
async def update_product(product_id: str, product_update: Dict[str, Any]):
    """Update a product (especially for category assignment)"""
    try:
        # Mevcut ürünü bul
        existing_product = await db.products.find_one({"id": product_id})
        if not existing_product:
            raise HTTPException(status_code=404, detail="Ürün bulunamadı")
        
        # Güncellenecek alanları hazırla
        update_data = {}
        
        # Kategori güncellenmesi
        if "category_id" in product_update:
            category_id = product_update["category_id"]
            
            # Kategori var mı kontrol et (eğer none değilse)
            if category_id and category_id != "none":
                category = await db.categories.find_one({"id": category_id})
                if not category:
                    raise HTTPException(status_code=404, detail="Kategori bulunamadı")
            
            update_data["category_id"] = category_id
        
        # Diğer güncellenebilir alanlar
        allowed_fields = ["name", "brand", "description", "list_price", "discounted_price", "currency", "company_id"]
        for field in allowed_fields:
            if field in product_update:
                update_data[field] = product_update[field]
        
        # Güncelleme zamanını ekle
        update_data["updated_at"] = datetime.utcnow().isoformat() + "Z"
        
        # Ürünü güncelle
        result = await db.products.update_one(
            {"id": product_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Ürün bulunamadı")
        
        # Güncellenmiş ürünü döndür
        updated_product = await db.products.find_one({"id": product_id})
        if updated_product:
            updated_product.pop('_id', None)
        
        return updated_product
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating product: {e}")
        raise HTTPException(status_code=500, detail=f"Ürün güncellenemedi: {str(e)}")

# ===== QUOTE ENDPOINTS =====

@api_router.post("/quotes", response_model=QuoteResponse)
async def create_quote(quote: QuoteCreate):
    """Create a new quote"""
    try:
        # Validate products exist
        product_ids = [p["id"] for p in quote.products]
        products_cursor = db.products.find({"id": {"$in": product_ids}})
        products = await products_cursor.to_list(length=None)
        
        if len(products) != len(quote.products):
            raise HTTPException(status_code=400, detail="Some products not found")
        
        # Create product-quantity mapping
        product_quantities = {p["id"]: p.get("quantity", 1) for p in quote.products}
        product_custom_prices = {p["id"]: p.get("custom_price") for p in quote.products}
        
        # Calculate totals
        total_list_price = 0
        total_discounted_price = 0
        processed_products = []
        
        # Fetch current exchange rates
        exchange_rates = await currency_service.get_exchange_rates()
        
        for product in products:
            # Get company info
            company = await db.companies.find_one({"id": product["company_id"]})
            
            # Get quantity for this product
            quantity = product_quantities.get(product["id"], 1)
            
            # Özel fiyat kontrolü
            custom_price = product_custom_prices.get(product["id"])
            currency = product.get("currency", "TRY")
            rate = float(exchange_rates.get(currency, 1)) if currency != 'TRY' else 1.0
            
            if custom_price is not None:
                custom_price = float(custom_price)
                list_price_try = custom_price * rate
                discounted_price_try = custom_price * rate
            else:
                list_price = float(product.get("list_price", 0))
                list_price_try = list_price * rate
                discounted_price = float(product.get("discounted_price", 0)) if product.get("discounted_price") else list_price
                discounted_price_try = discounted_price * rate
            
            # Calculate totals with quantity - SADECE LİSTE FİYATI KULLAN
            total_list_price += list_price_try * quantity
            total_discounted_price += list_price_try * quantity  # PDF için liste fiyatı kullan
            
            processed_products.append({
                "id": product["id"],
                "name": product["name"],
                "description": product.get("description"),
                "company_name": company["name"] if company else "Unknown",
                "list_price": product["list_price"],
                "list_price_try": list_price_try,
                "discounted_price": product.get("discounted_price"),
                "discounted_price_try": discounted_price_try,
                "currency": product["currency"],
                "quantity": quantity,
                "custom_price": custom_price
            })
        
        # Apply quote discount
        quote_discount_amount = total_discounted_price * (quote.discount_percentage / 100)
        
        # Add labor cost to the calculation
        labor_cost = float(quote.labor_cost)
        total_with_labor = total_discounted_price - quote_discount_amount + labor_cost
        total_net_price = total_with_labor
        
        # Create quote document
        quote_doc = {
            "id": str(uuid.uuid4()),
            "name": quote.name,
            "customer_name": quote.customer_name,
            "customer_email": quote.customer_email,
            "customer_id": quote.customer_id,  # Müşteriye teklif bağlama (bug fix)
            "discount_percentage": quote.discount_percentage,
            "labor_cost": labor_cost,  # İşçilik maliyeti eklendi
            "total_list_price": total_list_price,
            "total_discounted_price": total_discounted_price,
            "total_net_price": total_net_price,
            "products": processed_products,
            "notes": quote.notes,
            "created_at": datetime.utcnow().isoformat() + "Z",
            "status": "active"
        }
        
        result = await db.quotes.insert_one(quote_doc)
        
        logger.info(f"Quote created: {quote.name} with {len(products)} products")
        return quote_doc
        
    except Exception as e:
        logger.error(f"Error creating quote: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating quote: {str(e)}")

@api_router.get("/quotes", response_model=List[QuoteResponse])
async def get_quotes():
    """Get all quotes"""
    try:
        quotes_cursor = db.quotes.find({"status": "active"}).sort("created_at", -1)
        quotes = await quotes_cursor.to_list(length=None)
        
        return quotes
        
    except Exception as e:
        logger.error(f"Error fetching quotes: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching quotes: {str(e)}")

@api_router.get("/quotes/{quote_id}", response_model=QuoteResponse)
async def get_quote(quote_id: str):
    """Get specific quote by ID"""
    try:
        quote = await db.quotes.find_one({"id": quote_id})
        
        if not quote:
            raise HTTPException(status_code=404, detail="Quote not found")

        return quote

    except HTTPException:
        raise  # 404'ü 500'e çevirme; olduğu gibi ilet
    except Exception as e:
        logger.error(f"Error fetching quote: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching quote: {str(e)}")

@api_router.delete("/quotes/{quote_id}")
async def delete_quote(quote_id: str):
    """Delete a quote"""
    try:
        result = await db.quotes.update_one(
            {"id": quote_id},
            {"$set": {"status": "deleted"}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        return {"success": True, "message": "Quote deleted successfully"}
        
    except Exception as e:
        logger.error(f"Error deleting quote: {e}")
        raise HTTPException(status_code=500, detail=f"Error deleting quote: {str(e)}")

@api_router.put("/quotes/{quote_id}")
async def update_quote(quote_id: str, quote_update: Dict[str, Any]):
    """Update an existing quote (especially for adding labor cost)"""
    try:
        # Mevcut teklifi bul
        existing_quote = await db.quotes.find_one({"id": quote_id, "status": "active"})
        if not existing_quote:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        # Güncellenecek alanları hazırla
        update_data = {}
        
        # İşçilik maliyeti güncellenirse toplam hesapla
        if "labor_cost" in quote_update:
            labor_cost = float(quote_update["labor_cost"])
            
            # Mevcut hesapları al
            total_discounted_price = existing_quote.get("total_discounted_price", 0)
            discount_percentage = existing_quote.get("discount_percentage", 0)
            
            # Net toplam hesapla
            discount_amount = total_discounted_price * (discount_percentage / 100)
            total_net_price = total_discounted_price - discount_amount + labor_cost
            
            update_data["labor_cost"] = labor_cost
            update_data["total_net_price"] = total_net_price
        
        # Diğer alanları da güncelle
        if "discount_percentage" in quote_update:
            update_data["discount_percentage"] = float(quote_update["discount_percentage"])
        
        # Ürün listesi güncellenirse - YENİ EKLENDİ
        if "products" in quote_update:
            logger.info("Quote product list is being updated...")
            products_data = quote_update["products"]
            
            # Ürün bilgilerini veritabanından al
            product_ids = [p["id"] for p in products_data]
            db_products = await db.products.find(
                {"id": {"$in": product_ids}}
            ).to_list(length=None)
            
            # Her ürün için detayları ekle
            processed_products = []
            total_list_price = 0
            total_discounted_price = 0
            
            # Fetch current exchange rates
            exchange_rates = await currency_service.get_exchange_rates()
            
            for product_data in products_data:
                product_id = product_data["id"]
                quantity = product_data.get("quantity", 1)
                
                # Ürün bilgisini bul
                product = next((p for p in db_products if p["id"] == product_id), None)
                if product:
                    # Get company info
                    company = await db.companies.find_one({"id": product["company_id"]})
                    
                    # Özel fiyat kontrolü
                    custom_price = product_data.get("custom_price")
                    currency = product.get("currency", "TRY")
                    rate = float(exchange_rates.get(currency, 1)) if currency != 'TRY' else 1.0
                    
                    if custom_price is not None:
                        custom_price = float(custom_price)
                        list_price_try = custom_price * rate
                        discounted_price_try = custom_price * rate
                    else:
                        list_price = float(product.get("list_price", 0))
                        list_price_try = list_price * rate
                        discounted_price = float(product.get("discounted_price", 0)) if product.get("discounted_price") else list_price
                        discounted_price_try = discounted_price * rate
                    
                    # Calculate totals with quantity - SADECE LİSTE FİYATI KULLAN
                    total_list_price += list_price_try * quantity
                    total_discounted_price += list_price_try * quantity  # PDF için liste fiyatı kullan
                    
                    processed_products.append({
                        "id": product["id"],
                        "name": product["name"],
                        "description": product.get("description"),
                        "company_name": company["name"] if company else "Unknown",
                        "list_price": product["list_price"],
                        "list_price_try": list_price_try,
                        "discounted_price": product.get("discounted_price"),
                        "discounted_price_try": discounted_price_try,
                        "currency": product["currency"],
                        "quantity": quantity,
                        "custom_price": custom_price
                    })
                else:
                    logger.warning(f"Product not found during quote update: {product_id}")
            
            # Güncellenen ürün listesini ve toplamları ekle
            update_data["products"] = processed_products
            update_data["total_list_price"] = total_list_price
            update_data["total_discounted_price"] = total_discounted_price
            
            # Net toplamı yeniden hesapla (indirim ve işçilikle birlikte)
            discount_percentage = quote_update.get("discount_percentage", existing_quote.get("discount_percentage", 0))
            labor_cost = quote_update.get("labor_cost", existing_quote.get("labor_cost", 0))
            
            discount_amount = total_list_price * (discount_percentage / 100)
            total_net_price = total_list_price - discount_amount + labor_cost
            
            update_data["discount_percentage"] = discount_percentage
            update_data["labor_cost"] = labor_cost
            update_data["discount_amount"] = discount_amount
            update_data["total_net_price"] = total_net_price
        
        # Teklif notları güncellenirse
        if "notes" in quote_update:
            update_data["notes"] = quote_update["notes"]
        
        # Teklif adı güncellenirse
        if "name" in quote_update:
            update_data["name"] = quote_update["name"]
        
        # Müşteri adı güncellenirse
        if "customer_name" in quote_update:
            update_data["customer_name"] = quote_update["customer_name"]
        
        # Müşteri e-postası güncellenirse
        if "customer_email" in quote_update:
            update_data["customer_email"] = quote_update["customer_email"]
        
        # Güncelleme zamanını ekle
        update_data["updated_at"] = datetime.utcnow().isoformat() + "Z"
        
        # Teklifi güncelle
        result = await db.quotes.update_one(
            {"id": quote_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        # Güncellenmiş teklifi döndür
        updated_quote = await db.quotes.find_one({"id": quote_id})
        if updated_quote:
            updated_quote.pop('_id', None)
        
        return updated_quote
        
    except Exception as e:
        logger.error(f"Error updating quote: {e}")
        raise HTTPException(status_code=500, detail=f"Error updating quote: {str(e)}")

class PDFQuoteGenerator:
    def __init__(self):
        self.setup_fonts()
        self.styles = getSampleStyleSheet()
        self.setup_styles()
    
    def setup_fonts(self):
        """Türkçe karakter desteği için font kurulumu"""
        self.montserrat_available = False
        self.montserrat_bold_available = False
        
        try:
            font_dir = Path(__file__).parent / 'fonts'
            
            # Montserrat Regular font
            montserrat_regular_path = font_dir / 'Montserrat-Regular.ttf'
            if montserrat_regular_path.exists():
                # Unicode subset ile kaydet
                pdfmetrics.registerFont(TTFont('Montserrat', str(montserrat_regular_path), subfontIndex=0))
                self.montserrat_available = True
                logger.info("Montserrat Regular font loaded successfully")
                
                # Test için Türkçe karakter desteğini kontrol et
                from reportlab.pdfbase.pdfmetrics import getFont
                try:
                    font = getFont('Montserrat')
                    # Türkçe karakterleri test et
                    test_chars = 'ğüşıöç ĞÜŞIÖÇ'
                    for char in test_chars:
                        if hasattr(font, 'face') and hasattr(font.face, 'getCharWidth'):
                            width = font.face.getCharWidth(ord(char))
                            if width == 0:
                                logger.warning(f"Character '{char}' not supported in Montserrat")
                except Exception as e:
                    logger.warning(f"Font test failed: {e}")
            else:
                logger.warning("Montserrat Regular font not found")
            
            # Montserrat Bold font
            montserrat_bold_path = font_dir / 'Montserrat-Bold.ttf'
            if montserrat_bold_path.exists():
                pdfmetrics.registerFont(TTFont('Montserrat-Bold', str(montserrat_bold_path), subfontIndex=0))
                self.montserrat_bold_available = True
                logger.info("Montserrat Bold font loaded successfully")
            else:
                logger.warning("Montserrat Bold font not found")
                
        except Exception as e:
            logger.error(f"Font loading error: {e}")
            self.montserrat_available = False
            self.montserrat_bold_available = False
    
    def get_font_name(self, is_bold=False):
        """Montserrat font adını döndür - Türkçe karakter desteği ile"""
        if is_bold and self.montserrat_bold_available:
            return 'Montserrat-Bold'
        elif not is_bold and self.montserrat_available:
            return 'Montserrat'
        elif is_bold:
            return 'Helvetica-Bold'
        else:
            return 'Helvetica'
    
    def setup_styles(self):
        """PDF için özel stiller tanımla - Yeni renk şeması ile"""
        
        # Yeni renk paleti
        primary_color = colors.HexColor('#25c7eb')      # Tablo renkleri için
        secondary_color = colors.HexColor('#1ba3cc')    # Eski renkler için
        new_primary_color = colors.HexColor('#2F4B68')  # Ana başlıklar için YENİ
        table_header_color = colors.HexColor('#A6C9EC') # Tablo başlık arka planı YENİ
        accent_color = colors.HexColor('#85e8ff')       # Açık turkuaz
        text_color = colors.HexColor('#2d3748')         # Koyu gri
        
        # Eyebrow (başlık üstü küçük etiket) - turkuaz, harf aralıklı
        self.eyebrow_style = ParagraphStyle(
            'Eyebrow',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=9,
            spaceAfter=2,
            spaceBefore=0,
            alignment=TA_LEFT,
            textColor=colors.HexColor('#1ba3cc'),
            leading=11,
        )

        # Başlık stili - Yeni renk (#2F4B68)
        self.title_style = ParagraphStyle(
            'CustomTitle',
            parent=self.styles['Heading1'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=21,
            spaceAfter=14,
            spaceBefore=0,
            alignment=TA_LEFT,
            textColor=new_primary_color,  # YENİ RENK
            leading=25
        )
        
        # Alt başlık stili - Yeni renk (#2F4B68)
        self.subtitle_style = ParagraphStyle(
            'SubTitle',
            parent=self.styles['Heading2'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=14,
            spaceAfter=10,
            spaceBefore=4,
            alignment=TA_LEFT,
            textColor=new_primary_color,  # YENİ RENK
            leading=18
        )
        
        # Firma bilgi stili
        self.company_style = ParagraphStyle(
            'CompanyInfo',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(),
            fontSize=11,
            spaceAfter=6,
            alignment=TA_LEFT,
            textColor=text_color,
            leading=14
        )
        
        # Normal metin stili
        self.normal_style = ParagraphStyle(
            'CustomNormal',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(),
            fontSize=10,
            spaceAfter=8,
            textColor=text_color,
            leading=13
        )
        
        # Veri stili (tablolar için)
        self.data_style = ParagraphStyle(
            'DataText',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(),
            fontSize=9,
            spaceAfter=4,
            textColor=text_color,
            leading=12
        )
        
        # Footer stili
        self.footer_style = ParagraphStyle(
            'Footer',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(),
            fontSize=9,
            alignment=TA_LEFT,
            textColor=colors.HexColor('#718096'),
            spaceAfter=6,
            leading=11
        )
        
        # Fiyat vurgu stili - Küçültülmüş ve yeni renk (#2F4B68)
        self.price_style = ParagraphStyle(
            'PriceHighlight',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=14,  # 16'dan 14'e küçültüldü
            alignment=TA_RIGHT,
            textColor=new_primary_color,  # YENİ RENK
            spaceAfter=10,
            leading=18
        )

    # Kurumsal teklif tasarımı renk paleti
    PROP_PRIMARY = '#1B3A5C'    # Koyu lacivert (başlık şeritleri, footer)
    PROP_PRIMARY2 = '#2F4B68'   # Ara lacivert
    PROP_ACCENT = '#4F7CAE'     # Orta mavi accent çizgi
    PROP_LIGHT = '#F4F6F9'      # Kart/zebra zemini
    PROP_BORDER = '#D9E0E8'     # İnce kenarlık
    PROP_CONTENT_W = 18.0       # cm — kullanılabilir içerik genişliği

    def create_quote_pdf(self, quote_data: Dict) -> BytesIO:
        """Kurumsal teklif PDF'i — PowerTrail tarzı profesyonel düzen."""
        buffer = BytesIO()

        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=1.5*cm,
            leftMargin=1.5*cm,
            topMargin=1.4*cm,
            bottomMargin=2.4*cm,  # alt iletişim şeridi için yer
            title=f"Teklif - {quote_data.get('name', 'Adsız')}",
            author="Çorlu Karavan"
        )

        story = []

        # 1) Üst başlık: logo + marka | sağ meta kutusu (No/Tarih/Geçerlilik)
        story.append(self._create_proposal_header(quote_data))
        story.append(Spacer(1, 16))

        # 2) Ürün tablosu (şeritli başlık dahil)
        story.append(self._create_proposal_products_table(quote_data['products']))
        story.append(Spacer(1, 16))

        # 3) Toplam teklif bölümü (tam genişlik yatay bant)
        story.append(self._create_totals_section_full(quote_data))
        story.append(Spacer(1, 14))

        # 4) Notlar & şartlar + imza (tam genişlik yatay bant)
        story.append(self._create_notes_section_full())

        doc.build(story, onFirstPage=self._draw_page_decorations, onLaterPages=self._draw_page_decorations)
        buffer.seek(0)
        return buffer

    def _draw_page_decorations(self, canvas, doc):
        """Her sayfaya üst ince accent şerit + alt koyu lacivert iletişim şeridi (slogan + iletişim)."""
        canvas.saveState()
        width, height = A4
        primary = colors.HexColor(self.PROP_PRIMARY)
        accent = colors.HexColor(self.PROP_ACCENT)

        # Üst ince accent şerit
        canvas.setFillColor(primary)
        canvas.rect(0, height - 6, width, 6, stroke=0, fill=1)

        # Slogan satırı (footer şeridinin hemen üstünde, ince)
        slogan_y = 2.05 * cm
        canvas.setFont(self.get_font_name(is_bold=True), 7.5)
        canvas.setFillColor(primary)
        canvas.drawCentredString(width / 2, slogan_y,
            "KALİTELİ EKİPMAN  ·  UZMAN MONTAJ  ·  KESİNTİSİZ ENERJİ")

        # Alt koyu lacivert iletişim şeridi
        bar_h = 1.5 * cm
        canvas.setFillColor(primary)
        canvas.rect(0, 0, width, bar_h, stroke=0, fill=1)
        # üst ince accent çizgi
        canvas.setFillColor(accent)
        canvas.rect(0, bar_h, width, 2.5, stroke=0, fill=1)

        # İletişim metinleri (ikon yerine kısa etiketler)
        canvas.setFillColor(colors.white)
        cy = bar_h / 2 - 3
        canvas.setFont(self.get_font_name(is_bold=True), 8)
        canvas.drawString(1.5 * cm, cy, "Tel: 0505 813 77 65")
        canvas.setFont(self.get_font_name(), 8)
        canvas.drawCentredString(width / 2 - 1.2*cm, cy, "info@corlukaravan.com")
        canvas.drawCentredString(width / 2 + 4.3*cm, cy, "www.corlukaravan.com")
        canvas.drawRightString(width - 1.5 * cm, cy, "Çorlu / Tekirdağ")
        # sayfa no (şeridin hemen üstünde sağda)
        canvas.setFont(self.get_font_name(), 6.5)
        canvas.setFillColor(colors.HexColor('#B8C4D0'))
        canvas.drawRightString(width - 1.5 * cm, bar_h + 5, f"Sayfa {doc.page}")
        canvas.restoreState()

    # ===================== KURUMSAL TEKLİF TASARIMI HELPER'LARI =====================

    def _quote_meta(self, quote_data: Dict):
        """Teklif no, tarih ve geçerlilik tarihini döndür."""
        quote_id = str(quote_data.get('id', '') or '')
        no = quote_id.replace('-', '')[:8].upper() if quote_id else datetime.now().strftime('%y%m%d%H')
        try:
            created = datetime.fromisoformat(quote_data['created_at'].replace('Z', '+00:00'))
        except Exception:
            created = datetime.now()
        return f"QT-{no}", created.strftime('%d.%m.%Y'), (created + timedelta(days=7)).strftime('%d.%m.%Y')

    def _create_proposal_header(self, quote_data: Dict):
        """Sol logo+marka | orta büyük başlık | sağ meta kutusu (No/Tarih/Geçerlilik)."""
        from reportlab.platypus import Table as PDFTable
        P = self.PROP_PRIMARY

        # --- Sol: logo + marka ---
        brand_style = ParagraphStyle('PHBrand', parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True), fontSize=17, textColor=colors.HexColor(P),
            alignment=TA_CENTER, leading=19)
        brand_par = [Paragraph("ÇORLU KARAVAN", brand_style)]
        logo_path = Path(__file__).parent / 'images' / 'corlu_karavan_logo_new.png'
        if logo_path.exists():
            try:
                logo_img = Image(str(logo_path), width=64, height=64)
                left_cell = PDFTable([[logo_img, brand_par]], colWidths=[72, 160])
                left_cell.setStyle(TableStyle([
                    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                    ('LEFTPADDING', (0,0), (-1,-1), 0), ('RIGHTPADDING', (0,0), (0,0), 8),
                    ('TOPPADDING', (0,0), (-1,-1), 0), ('BOTTOMPADDING', (0,0), (-1,-1), 0),
                ]))
            except Exception:
                left_cell = brand_par
        else:
            left_cell = brand_par

        # --- Sağ: meta kutusu ---
        no, date_str, valid_str = self._quote_meta(quote_data)
        ml = ParagraphStyle('PHMetaL', parent=self.styles['Normal'],
            fontName=self.get_font_name(), fontSize=7.5, textColor=colors.HexColor('#6B7B8C'), leading=10)
        mv = ParagraphStyle('PHMetaV', parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True), fontSize=8, textColor=colors.HexColor(P),
            alignment=TA_RIGHT, leading=10)
        meta_rows = [
            [Paragraph("Teklif No", ml), Paragraph(no, mv)],
            [Paragraph("Tarih", ml), Paragraph(date_str, mv)],
            [Paragraph("Geçerlilik", ml), Paragraph(valid_str, mv)],
        ]
        meta_tbl = PDFTable(meta_rows, colWidths=[2.0*cm, 2.9*cm])
        meta_tbl.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('BOX', (0,0), (-1,-1), 0.6, colors.HexColor(self.PROP_BORDER)),
            ('INNERGRID', (0,0), (-1,-1), 0.6, colors.HexColor(self.PROP_BORDER)),
            ('LINEBEFORE', (0,0), (0,-1), 3, colors.HexColor(P)),
            ('TOPPADDING', (0,0), (-1,-1), 6), ('BOTTOMPADDING', (0,0), (-1,-1), 6),
            ('LEFTPADDING', (0,0), (-1,-1), 6), ('RIGHTPADDING', (0,0), (-1,-1), 6),
        ]))

        header = PDFTable([[left_cell, meta_tbl]], colWidths=[13.0*cm, 5.0*cm])
        header.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('ALIGN', (1,0), (1,0), 'RIGHT'),
            ('LEFTPADDING', (0,0), (-1,-1), 0), ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (-1,-1), 0), ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ]))
        return header

    def _create_section_band(self, title: str):
        """Koyu lacivert bölüm başlık şeridi."""
        from reportlab.platypus import Table as PDFTable
        st = ParagraphStyle('BandTitle', parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True), fontSize=10, textColor=colors.white, leading=12)
        band = PDFTable([[Paragraph(title, st)]], colWidths=[self.PROP_CONTENT_W*cm])
        band.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(self.PROP_PRIMARY)),
            ('LINEBEFORE', (0,0), (0,-1), 4, colors.HexColor(self.PROP_ACCENT)),
            ('TOPPADDING', (0,0), (-1,-1), 7), ('BOTTOMPADDING', (0,0), (-1,-1), 7),
            ('LEFTPADDING', (0,0), (-1,-1), 12), ('RIGHTPADDING', (0,0), (-1,-1), 12),
        ]))
        return band

    def _create_client_info_block(self, quote_data: Dict):
        """MÜŞTERİ BİLGİLERİ şeridi + 2 kolonlu kart."""
        from reportlab.platypus import Table as PDFTable
        band = self._create_section_band("MÜŞTERİ BİLGİLERİ")

        lbl = ParagraphStyle('CILabel', parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True), fontSize=8.5, textColor=colors.HexColor('#5A6B7C'), leading=12)
        val = ParagraphStyle('CIVal', parent=self.styles['Normal'],
            fontName=self.get_font_name(), fontSize=9, textColor=colors.HexColor('#2D3748'), leading=12)
        valb = ParagraphStyle('CIValB', parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True), fontSize=9, textColor=colors.HexColor(self.PROP_PRIMARY), leading=12)

        customer = quote_data.get('customer_name') or 'Bireysel Müşteri'
        email = quote_data.get('customer_email') or '-'
        title = quote_data.get('name', 'Fiyat Teklifi')
        notes = (quote_data.get('notes') or '').strip() or '-'
        if len(notes) > 160:
            notes = notes[:157] + '...'

        def kv(label, value, vstyle=val):
            return PDFTable([[Paragraph(label, lbl), Paragraph(value, vstyle)]], colWidths=[2.3*cm, 6.0*cm])

        left_col = [
            kv("Müşteri Adı", customer, valb), Spacer(1, 6),
            kv("E-posta", email),
        ]
        right_col = [
            kv("Teklif Başlığı", title, valb), Spacer(1, 6),
            kv("Proje Notları", notes),
        ]
        card = PDFTable([[left_col, right_col]], colWidths=[8.9*cm, 9.1*cm])
        card.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(self.PROP_LIGHT)),
            ('BOX', (0,0), (-1,-1), 0.6, colors.HexColor(self.PROP_BORDER)),
            ('LINEAFTER', (0,0), (0,0), 0.6, colors.HexColor(self.PROP_BORDER)),
            ('TOPPADDING', (0,0), (-1,-1), 10), ('BOTTOMPADDING', (0,0), (-1,-1), 10),
            ('LEFTPADDING', (0,0), (-1,-1), 14), ('RIGHTPADDING', (0,0), (-1,-1), 14),
        ]))
        return KeepTogether([band, card])

    def _create_proposal_products_table(self, products: List[Dict]):
        """ITEM/Ürün/Adet/Birim/Birim(TL)/Tutar/Tutar(TL) — şeritli kurumsal tablo."""
        P = self.PROP_PRIMARY
        band = self._create_section_band("TEKLİF İÇERİĞİ")

        hs = ParagraphStyle('PTH', parent=self.data_style, fontName=self.get_font_name(is_bold=True),
            textColor=colors.white, fontSize=8.5, leading=10)
        hsc = ParagraphStyle('PTHc', parent=hs, alignment=TA_CENTER)
        hsr = ParagraphStyle('PTHr', parent=hs, alignment=TA_RIGHT)
        c_l = ParagraphStyle('PTl', parent=self.data_style, fontName=self.get_font_name(), fontSize=8.5, leading=11)
        c_c = ParagraphStyle('PTc', parent=c_l, alignment=TA_CENTER)
        c_r = ParagraphStyle('PTr', parent=c_l, alignment=TA_RIGHT)
        c_rb = ParagraphStyle('PTrb', parent=c_r, fontName=self.get_font_name(is_bold=True))
        c_rbb = ParagraphStyle('PTrbb', parent=c_rb, textColor=colors.HexColor(P))
        idx_st = ParagraphStyle('PTidx', parent=c_c, fontName=self.get_font_name(is_bold=True),
            textColor=colors.HexColor(P))

        headers = [
            Paragraph("#", hsc), Paragraph("ÜRÜN", hs), Paragraph("ADET", hsc),
            Paragraph("BİRİM FİYAT", hsr), Paragraph("BİRİM (TL)", hsr),
            Paragraph("TUTAR", hsr), Paragraph("TUTAR (TL)", hsr),
        ]
        data = [headers]
        for i, product in enumerate(products, 1):
            qty = product.get('quantity', 1)
            cur = product.get('currency', 'TRY')
            sym = '$' if cur == 'USD' else ('€' if cur == 'EUR' else '₺')
            cp = product.get('custom_price')
            unit = float(cp) if cp is not None else float(product.get('list_price', 0))
            total = unit * qty
            unit_try = float(product.get('list_price_try', 0))
            total_try = unit_try * qty
            name = product.get('name', '')
            info = f"<b>{name}</b>"
            data.append([
                Paragraph(str(i), idx_st),
                Paragraph(info, c_l),
                Paragraph(str(qty), c_c),
                Paragraph(f"{sym} {self._format_price_modern(unit)}", c_r),
                Paragraph(f"₺ {self._format_price_modern(unit_try)}", c_r),
                Paragraph(f"{sym} {self._format_price_modern(total)}", c_rb),
                Paragraph(f"<b>₺ {self._format_price_modern(total_try)}</b>", c_rbb),
            ])

        table = Table(data, colWidths=[0.85*cm, 5.35*cm, 1.45*cm, 2.4*cm, 2.4*cm, 2.5*cm, 2.65*cm], repeatRows=1)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor(P)),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,0), 8), ('BOTTOMPADDING', (0,0), (-1,0), 8),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor(self.PROP_LIGHT)]),
            ('TOPPADDING', (0,1), (-1,-1), 7), ('BOTTOMPADDING', (0,1), (-1,-1), 7),
            ('LINEBELOW', (0,1), (-1,-1), 0.4, colors.HexColor(self.PROP_BORDER)),
            ('LINEAFTER', (0,0), (0,-1), 0.4, colors.HexColor(self.PROP_BORDER)),
            ('LEFTPADDING', (0,0), (-1,-1), 7), ('RIGHTPADDING', (0,0), (-1,-1), 7),
            ('LEFTPADDING', (0,0), (0,-1), 3), ('RIGHTPADDING', (0,0), (0,-1), 3),
            ('BOX', (0,0), (-1,-1), 0.6, colors.HexColor(self.PROP_BORDER)),
        ]))
        return KeepTogether([band, table]) if len(products) <= 6 else Table([[band],[table]], colWidths=[self.PROP_CONTENT_W*cm])

    def _create_totals_section_full(self, quote_data: Dict):
        """TOPLAM TEKLİF — fatura estetiği: şerit başlık + ara toplam satırları + büyük GENEL TOPLAM barı."""
        from reportlab.platypus import Table as PDFTable
        P = self.PROP_PRIMARY
        W = self.PROP_CONTENT_W
        net = quote_data.get('total_net_price', 0)

        band = self._create_section_band("TOPLAM TEKLİF")

        lbl = ParagraphStyle('TBL', parent=self.styles['Normal'],
            fontName=self.get_font_name(), fontSize=9.5, textColor=colors.HexColor('#4A5868'),
            alignment=TA_RIGHT, leading=13)
        valr = ParagraphStyle('TBV', parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True), fontSize=9.5, textColor=colors.HexColor('#2D3748'),
            alignment=TA_RIGHT, leading=13)

        # --- Ara toplam kalemleri: sağ blokta hizalı (label sağ | değer sağ) ---
        total_list = quote_data.get('total_list_price', 0)
        rows = [[Paragraph("Ara Toplam (Liste)", lbl), Paragraph(f"₺ {self._format_price_modern(total_list)}", valr)]]
        disc = quote_data.get('discount_percentage', 0)
        if disc > 0:
            rows.append([Paragraph(f"İndirim (%{disc})", lbl),
                Paragraph(f"<font color='#dc2626'>− ₺ {self._format_price_modern(total_list*disc/100)}</font>", valr)])
        labor = quote_data.get('labor_cost', 0)
        if labor > 0:
            rows.append([Paragraph("İşçilik Maliyeti", lbl),
                Paragraph(f"<font color='#059669'>+ ₺ {self._format_price_modern(labor)}</font>", valr)])
        sub = PDFTable(rows, colWidths=[5.0*cm, 4.0*cm], hAlign='RIGHT')
        sstyle = [
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,-1), 7), ('BOTTOMPADDING', (0,0), (-1,-1), 7),
            ('LEFTPADDING', (0,0), (-1,-1), 4), ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ]
        for i in range(len(rows)-1):
            sstyle.append(('LINEBELOW', (0,i), (-1,i), 0.4, colors.HexColor(self.PROP_BORDER)))
        sub.setStyle(TableStyle(sstyle))

        # Ara toplam bölgesi: açık zeminli, sağa hizalı kalemler (sol taraf ferah boşluk)
        sub_wrap = PDFTable([[sub]], colWidths=[W*cm])
        sub_wrap.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(self.PROP_LIGHT)),
            ('ALIGN', (0,0), (-1,-1), 'RIGHT'),
            ('TOPPADDING', (0,0), (-1,-1), 4), ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('LEFTPADDING', (0,0), (-1,-1), 16), ('RIGHTPADDING', (0,0), (-1,-1), 16),
        ]))

        # --- GENEL TOPLAM barı: tam genişlik, koyu, sol etiket + sağ büyük rakam ---
        gl = ParagraphStyle('GTL', parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True), fontSize=12.5, textColor=colors.white, leading=16)
        glsub = ParagraphStyle('GTLs', parent=self.styles['Normal'],
            fontName=self.get_font_name(), fontSize=7.5, textColor=colors.HexColor('#A9C2DD'), leading=10)
        gv = ParagraphStyle('GTV', parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True), fontSize=22, textColor=colors.white,
            alignment=TA_RIGHT, leading=25)
        # döviz karşılığı (sağ rakamın altında küçük)
        fx_txt = ""
        try:
            eur = float(currency_service.rates_cache.get('EUR', 37.0)) if currency_service.rates_cache else 37.0
            usd = float(currency_service.rates_cache.get('USD', 34.0)) if currency_service.rates_cache else 34.0
            fx_txt = f"≈ € {self._format_price_modern(net/eur)}  |  $ {self._format_price_modern(net/usd)}"
        except Exception:
            pass
        gfx = ParagraphStyle('GTFX', parent=self.styles['Normal'],
            fontName=self.get_font_name(), fontSize=8, textColor=colors.HexColor('#A9C2DD'),
            alignment=TA_RIGHT, leading=11)

        left_cell = [Paragraph("GENEL TOPLAM", gl), Paragraph("Net ödenecek tutar", glsub)]
        right_cell = [Paragraph(f"₺ {self._format_price_modern(net)}", gv)]
        if fx_txt:
            right_cell.append(Paragraph(fx_txt, gfx))
        grand = PDFTable([[left_cell, right_cell]], colWidths=[9.0*cm, 9.0*cm])
        grand.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(P)),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('LINEABOVE', (0,0), (-1,0), 3, colors.HexColor(self.PROP_ACCENT)),
            ('TOPPADDING', (0,0), (-1,-1), 14), ('BOTTOMPADDING', (0,0), (-1,-1), 14),
            ('LEFTPADDING', (0,0), (0,0), 16), ('RIGHTPADDING', (-1,0), (-1,0), 16),
        ]))

        outer = PDFTable([[band],[sub_wrap],[grand]], colWidths=[W*cm])
        outer.setStyle(TableStyle([
            ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
            ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0),
            ('BOX',(0,0),(-1,-1),0.6,colors.HexColor(self.PROP_BORDER)),
        ]))
        return KeepTogether([outer])

    def _create_notes_section_full(self):
        """Tam genişlik yatay NOTLAR & ŞARTLAR bandı + imza (sağ alt)."""
        from reportlab.platypus import Table as PDFTable
        P = self.PROP_PRIMARY
        W = self.PROP_CONTENT_W

        band = self._create_section_band("NOTLAR & ŞARTLAR")

        terms_st = ParagraphStyle('TS', parent=self.styles['Normal'],
            fontName=self.get_font_name(), fontSize=8, textColor=colors.HexColor('#4A5568'), leading=12)
        terms = (
            "• Yukarıdaki fiyatlandırmanın, 1 hafta geçerli olduğunu lütfen göz önünde bulundurunuz.<br/>"
            "• Ürün özellikleri ve fiyatları değişiklik gösterebilir.<br/>"
            "• Servisimiz dışında yapılan işlemlerde montaj ve nakliye masrafları ayrıca hesaplanacaktır."
        )

        # İmza (sağ) — çizgi + isim + altyazı aynı genişlikte ortalı blok
        sig_name = ParagraphStyle('SIGN', parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True), fontSize=9.5, textColor=colors.HexColor(P),
            alignment=TA_CENTER, leading=12)
        sig_sub = ParagraphStyle('SIGS', parent=self.styles['Normal'],
            fontName=self.get_font_name(), fontSize=7.5, textColor=colors.HexColor('#6B7B8C'),
            alignment=TA_CENTER, leading=10)
        sig_block = PDFTable([
            [Spacer(1, 14)],
            [Paragraph("Mehmet Necdet Zamkı", sig_name)],
            [Paragraph("Çorlu Karavan", sig_sub)],
        ], colWidths=[5.0*cm], hAlign='RIGHT')
        sig_block.setStyle(TableStyle([
            ('LINEBELOW', (0,1), (0,1), 0.8, colors.HexColor('#9AA8B6')),  # isim ALTINA imza çizgisi
            ('TOPPADDING', (0,1), (0,1), 0), ('BOTTOMPADDING', (0,1), (0,1), 2),  # isim-çizgi arası (yakın)
            ('TOPPADDING', (0,0), (0,0), 0), ('BOTTOMPADDING', (0,0), (0,0), 0),
            ('TOPPADDING', (0,2), (0,2), 3), ('BOTTOMPADDING', (0,2), (0,2), 0),  # çizgi-Çorlu arası (yakın)
            ('LEFTPADDING', (0,0), (-1,-1), 0), ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ]))
        sig_inner = [sig_block]

        content = PDFTable([[Paragraph(terms, terms_st), sig_inner]], colWidths=[11.5*cm, 6.5*cm])
        content.setStyle(TableStyle([
            ('VALIGN', (0,0), (0,0), 'TOP'), ('VALIGN', (1,0), (1,0), 'TOP'),
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(self.PROP_LIGHT)),
            ('LEFTPADDING', (0,0), (-1,-1), 14), ('RIGHTPADDING', (0,0), (-1,-1), 14),
            ('TOPPADDING', (0,0), (-1,-1), 10), ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ]))

        outer = PDFTable([[band],[content]], colWidths=[W*cm])
        outer.setStyle(TableStyle([
            ('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),
            ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0),
            ('BOX',(0,1),(-1,1),0.6,colors.HexColor(self.PROP_BORDER)),
        ]))
        return KeepTogether([outer])

    def _create_modern_header(self, quote_data: Dict = None, badge_label: str = "TEKLİF NO"):
        """Logo + Çorlu Karavan bilgileri (sol) ve no/tarih rozeti (sağ üst)."""
        from reportlab.platypus import Table as PDFTable

        # Sağ üst rozet (no + tarih)
        badge_flowable = self._create_header_badge(quote_data or {}, badge_label=badge_label)

        # Firma iletişim metni
        company_info = [
            "<font size='15' color='#2F4B68'><b>ÇORLU KARAVAN</b></font>",
            "<font size='8' color='#1ba3cc'><b>KARAVAN ELEKTRİK EKİPMANLARI</b></font>",
            " ",
            "<font size='9' color='#4A5568'>Hatip, Sarı Salkım 3. Sokak Mobilyacılar Sitesi No: B1, 59000 Çorlu/Tekirdağ</font>",
            "<font size='9' color='#4A5568'>Telefon: 0505 813 77 65 &nbsp;·&nbsp; info@corlukaravan.com</font>",
        ]
        company_paragraph = Paragraph("<br/>".join(company_info), self.company_style)

        logo_path = Path(__file__).parent / 'images' / 'corlu_karavan_logo_new.png'
        left_cell = company_paragraph
        if logo_path.exists():
            try:
                logo_img = Image(str(logo_path), width=70, height=70)
                left_inner = PDFTable([[logo_img, company_paragraph]], colWidths=[80, 250])
                left_inner.setStyle(TableStyle([
                    ('ALIGN', (0, 0), (0, 0), 'CENTER'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 0),
                    ('RIGHTPADDING', (0, 0), (0, 0), 8),
                    ('TOPPADDING', (0, 0), (-1, -1), 0),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
                ]))
                left_cell = left_inner
            except Exception as e:
                logger.error(f"Logo loading error: {e}")

        # Sol (logo+firma) | Sağ (rozet) — 16cm toplam
        header_table = PDFTable([[left_cell, badge_flowable]], colWidths=[11.0*cm, 5.0*cm])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (0, 0), 'MIDDLE'),
            ('VALIGN', (1, 0), (1, 0), 'TOP'),
            ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        return header_table

    def _create_header_badge(self, quote_data: Dict, badge_label: str = "TEKLİF NO"):
        """Sağ üstte belge numarası ve tarihini gösteren kompakt rozet."""
        from reportlab.platypus import Table as PDFTable

        # No: id'nin ilk 8 hanesi (yoksa tarih bazlı)
        quote_id = str(quote_data.get('id', '') or '')
        quote_no = quote_id.replace('-', '')[:8].upper() if quote_id else datetime.now().strftime('%y%m%d%H')
        try:
            created = datetime.fromisoformat(quote_data['created_at'].replace('Z', '+00:00'))
            date_str = created.strftime('%d.%m.%Y')
        except Exception:
            date_str = datetime.now().strftime('%d.%m.%Y')

        label_style = ParagraphStyle('BadgeLabel', parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True), fontSize=7, textColor=colors.HexColor('#A6C9EC'),
            alignment=TA_RIGHT, leading=9)
        value_style = ParagraphStyle('BadgeValue', parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True), fontSize=11, textColor=colors.white,
            alignment=TA_RIGHT, leading=14)
        date_style = ParagraphStyle('BadgeDate', parent=self.styles['Normal'],
            fontName=self.get_font_name(), fontSize=9, textColor=colors.white,
            alignment=TA_RIGHT, leading=12)

        inner = [
            Paragraph(badge_label, label_style),
            Paragraph(f"#{quote_no}", value_style),
            Spacer(1, 5),
            Paragraph("TARİH", label_style),
            Paragraph(date_str, date_style),
        ]
        badge = PDFTable([[inner]], colWidths=[4.4*cm])
        badge.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#2F4B68')),
            ('TOPPADDING', (0, 0), (-1, -1), 12),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ('LEFTPADDING', (0, 0), (-1, -1), 14),
            ('RIGHTPADDING', (0, 0), (-1, -1), 14),
            ('LINEABOVE', (0, 0), (-1, 0), 3, colors.HexColor('#25c7eb')),
        ]))
        return badge
    
    def _create_quote_info_section(self, quote_data: Dict):
        """Teklif ve müşteri bilgilerini içeren premium kart görünümü"""
        try:
            created_date = datetime.fromisoformat(quote_data['created_at'].replace('Z', '+00:00'))
            start_date_str = created_date.strftime('%d.%m.%Y')
            end_date = created_date + timedelta(days=7)
            end_date_str = end_date.strftime('%d.%m.%Y')
        except (ValueError, TypeError, KeyError, AttributeError):
            today = datetime.now()
            start_date_str = today.strftime('%d.%m.%Y')
            end_date_str = (today + timedelta(days=7)).strftime('%d.%m.%Y')
            
        customer_name = quote_data.get('customer_name')
        if not customer_name:
            customer_name = "Bireysel Müşteri"
            
        # Bilgi başlığı ve değer stilleri
        info_label_style = ParagraphStyle(
            'InfoLabel',
            parent=self.normal_style,
            fontName=self.get_font_name(is_bold=True),
            fontSize=8.5,
            textColor=colors.HexColor('#4A5568'),
            spaceAfter=0
        )
        info_val_style = ParagraphStyle(
            'InfoValue',
            parent=self.normal_style,
            fontName=self.get_font_name(),
            fontSize=9,
            textColor=colors.HexColor('#2D3748'),
            spaceAfter=0
        )
        info_val_bold_style = ParagraphStyle(
            'InfoValueBold',
            parent=self.normal_style,
            fontName=self.get_font_name(is_bold=True),
            fontSize=9,
            textColor=colors.HexColor('#2F4B68'),
            spaceAfter=0
        )
        
        # 2 Satırlı, 4 Sütunlu Izgara
        info_data = [
            [
                Paragraph("<b>Müşteri Adı:</b>", info_label_style),
                Paragraph(customer_name, info_val_bold_style),
                Paragraph("<b>Teklif Tarihi:</b>", info_label_style),
                Paragraph(start_date_str, info_val_style)
            ],
            [
                Paragraph("<b>Teklif Başlığı:</b>", info_label_style),
                Paragraph(quote_data.get('name', 'Fiyat Teklifi'), info_val_style),
                Paragraph("<b>Geçerlilik Tarihi:</b>", info_label_style),
                Paragraph(end_date_str, info_val_style)
            ]
        ]
        
        # Toplam genişlik: 16cm
        info_table = Table(info_data, colWidths=[3.0*cm, 5.0*cm, 4.0*cm, 4.0*cm])
        info_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
            ('LINEBEFORE', (0, 0), (0, -1), 3.5, colors.HexColor('#25c7eb')),  # sol turkuaz accent
            ('LINEBELOW', (0, 0), (-1, 0), 0.5, colors.HexColor('#E2E8F0')),   # satır ayıracı
            ('TOPPADDING', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
            ('LEFTPADDING', (0, 0), (0, -1), 14),
            ('LEFTPADDING', (1, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ]))
        
        return info_table
    
    def _create_date_header(self):
        """Sağ üst köşede tarih"""
        from datetime import datetime
        from reportlab.platypus import Table as PDFTable
        
        # Tarih
        now = datetime.now()
        date_str = now.strftime('%d.%m.%Y')
        
        # Sağa hizalı tarih
        date_style = ParagraphStyle(
            'DateHeader',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(),
            fontSize=11,
            alignment=TA_RIGHT,
            textColor=colors.HexColor('#4A5568')
        )
        
        date_paragraph = Paragraph(f"Tarih: {date_str}", date_style)
        return date_paragraph
    
    def _create_modern_products_table(self, products: List[Dict]):
        """Modern tasarımda ürün tablosu oluştur - Sadece yatay çizgilerle minimalist tasarım"""
        primary_color = colors.HexColor('#25c7eb')
        secondary_color = colors.HexColor('#1ba3cc')
        new_primary_color = colors.HexColor('#2F4B68')  # Kurumsal Koyu Mavi
        accent_color = colors.HexColor('#F8FAFC')       # Çok Fesah Açık Gri
        
        # Local styles for column alignment and typography
        header_left = ParagraphStyle('HLeft', parent=self.data_style, fontName=self.get_font_name(is_bold=True), textColor=colors.white, fontSize=9)
        header_center = ParagraphStyle('HCenter', parent=self.data_style, fontName=self.get_font_name(is_bold=True), textColor=colors.white, alignment=TA_CENTER, fontSize=9)
        header_right = ParagraphStyle('HRight', parent=self.data_style, fontName=self.get_font_name(is_bold=True), textColor=colors.white, alignment=TA_RIGHT, fontSize=9)
        
        cell_left = ParagraphStyle('CLeft', parent=self.data_style, fontName=self.get_font_name(), fontSize=8.5, leading=11)
        cell_center = ParagraphStyle('CCenter', parent=self.data_style, fontName=self.get_font_name(), alignment=TA_CENTER, fontSize=8.5)
        cell_right = ParagraphStyle('CRight', parent=self.data_style, fontName=self.get_font_name(), alignment=TA_RIGHT, fontSize=8.5)
        cell_right_bold = ParagraphStyle('CRightBold', parent=self.data_style, fontName=self.get_font_name(is_bold=True), alignment=TA_RIGHT, fontSize=8.5)
        cell_right_bold_blue = ParagraphStyle('CRightBoldBlue', parent=self.data_style, fontName=self.get_font_name(is_bold=True), textColor=secondary_color, alignment=TA_RIGHT, fontSize=8.5)
        
        # Tablo başlıkları (Genişletilmiş sütunlar, Miktar sığacak şekilde 1.6*cm)
        headers = [
            Paragraph("<b>Ürün Bilgisi</b>", header_left),
            Paragraph("<b>Adet</b>", header_center),
            Paragraph("<b>Birim Fiyat</b>", header_right),
            Paragraph("<b>Birim (TL)</b>", header_right),
            Paragraph("<b>Tutar</b>", header_right),
            Paragraph("<b>Tutar (TL)</b>", header_right)
        ]
        
        data = [headers]
        
        # Ürün satırları
        for product in products:
            quantity = product.get('quantity', 1)
            currency = product.get('currency', 'TRY')
            
            # Currency symbol helper
            symbol = '$' if currency == 'USD' else ('€' if currency == 'EUR' else '₺')
            
            # Original currency unit price
            custom_price = product.get('custom_price')
            if custom_price is not None:
                unit_price_orig = float(custom_price)
            else:
                unit_price_orig = float(product.get('list_price', 0))
            
            total_price_orig = unit_price_orig * quantity
            
            # TL unit price (from precalculated/saved list_price_try)
            unit_price_try = float(product.get('list_price_try', 0))
            total_price_try = unit_price_try * quantity
            
            # Name and Description
            name_text = product.get('name', '')
            desc_text = product.get('description', '')
            if desc_text:
                full_product_info = f"<b>{name_text}</b><br/><font size='7' color='#718096'>{desc_text}</font>"
            else:
                full_product_info = f"<b>{name_text}</b>"
                
            row = [
                Paragraph(full_product_info, cell_left),
                Paragraph(str(quantity), cell_center),
                Paragraph(f"{symbol} {self._format_price_modern(unit_price_orig)}", cell_right),
                Paragraph(f"₺ {self._format_price_modern(unit_price_try)}", cell_right),
                Paragraph(f"{symbol} {self._format_price_modern(total_price_orig)}", cell_right_bold),
                Paragraph(f"<b>₺ {self._format_price_modern(total_price_try)}</b>", cell_right_bold_blue)
            ]
            data.append(row)
        
        # Tablo genişlikleri (A4 kullanılabilir alan: 16cm = 160mm, Miktar 1.6cm ile tek satırda sığdırıldı)
        table = Table(data, colWidths=[4.7*cm, 1.6*cm, 2.3*cm, 2.3*cm, 2.45*cm, 2.55*cm], repeatRows=1)
        table.setStyle(TableStyle([
            # Başlık stili - Premium koyu renk + turkuaz üst accent
            ('BACKGROUND', (0, 0), (-1, 0), new_primary_color),
            ('LINEABOVE', (0, 0), (-1, 0), 2.5, colors.HexColor('#25c7eb')),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, 0), 11),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 11),
            
            # Veri satırları renklendirme (Zebra desenli ferah görünüm)
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, accent_color]),
            ('TOPPADDING', (0, 1), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
            
            # Yatay bölücü çizgiler (Dikey çizgiler minimalist etki için tamamen kaldırıldı)
            ('LINEBELOW', (0, 0), (-1, 0), 1.5, new_primary_color),       # Başlık altı kalın çizgi
            ('LINEBELOW', (0, 1), (-1, -1), 0.5, colors.HexColor('#E2E8F0')), # Satır araları ince bölücüler
            
            # İç dolgular
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            # Adet sütunu dar olduğu için dolgusunu azalt (başlık kırılmasını önler)
            ('LEFTPADDING', (1, 0), (1, -1), 2),
            ('RIGHTPADDING', (1, 0), (1, -1), 2),
        ]))

        return table
    
    def _create_modern_totals_section(self, quote_data: Dict):
        """Modern toplam hesaplama bölümü - Sağ tarafta tablo düzeninde"""
        new_primary_color = colors.HexColor('#2F4B68')
        secondary_color = colors.HexColor('#1ba3cc')
        
        # Styles for totals table
        label_style = ParagraphStyle(
            'TotalLabel',
            parent=self.normal_style,
            fontName=self.get_font_name(),
            fontSize=9.5,
            alignment=TA_LEFT,
            leading=12
        )
        value_style = ParagraphStyle(
            'TotalValue',
            parent=self.normal_style,
            fontName=self.get_font_name(),
            fontSize=9.5,
            alignment=TA_RIGHT,
            leading=12
        )
        
        label_bold_style = ParagraphStyle(
            'TotalLabelBold',
            parent=self.normal_style,
            fontName=self.get_font_name(is_bold=True),
            fontSize=11,
            alignment=TA_LEFT,
            textColor=new_primary_color,
            leading=14
        )
        value_bold_style = ParagraphStyle(
            'TotalValueBold',
            parent=self.normal_style,
            fontName=self.get_font_name(is_bold=True),
            fontSize=11,
            alignment=TA_RIGHT,
            textColor=new_primary_color,
            leading=14
        )
        
        label_muted_style = ParagraphStyle(
            'TotalLabelMuted',
            parent=self.normal_style,
            fontName=self.get_font_name(),
            fontSize=8,
            alignment=TA_LEFT,
            textColor=colors.HexColor('#718096'),
            leading=10
        )
        value_muted_style = ParagraphStyle(
            'TotalValueMuted',
            parent=self.normal_style,
            fontName=self.get_font_name(),
            fontSize=8,
            alignment=TA_RIGHT,
            textColor=colors.HexColor('#718096'),
            leading=10
        )
        
        # --- Ara toplamlar (açık zeminli kutu) ---
        sub_data = []
        total_list_price = quote_data.get('total_list_price', 0)
        sub_data.append([
            Paragraph("Genel Liste Toplamı", label_style),
            Paragraph(f"₺ {self._format_price_modern(total_list_price)}", value_style)
        ])

        discount_percentage = quote_data.get('discount_percentage', 0)
        if discount_percentage > 0:
            discount_amount = total_list_price * (discount_percentage / 100)
            sub_data.append([
                Paragraph(f"Uygulanan İndirim (%{discount_percentage})", label_style),
                Paragraph(f"<font color='#dc2626'>− ₺ {self._format_price_modern(discount_amount)}</font>", value_style)
            ])

        labor_cost = quote_data.get('labor_cost', 0)
        if labor_cost > 0:
            sub_data.append([
                Paragraph("İşçilik Maliyeti", label_style),
                Paragraph(f"<font color='#059669'>+ ₺ {self._format_price_modern(labor_cost)}</font>", value_style)
            ])

        sub_table = Table(sub_data, colWidths=[5.5*cm, 3.5*cm])
        sub_style = [
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 7),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
        ]
        for i in range(len(sub_data) - 1):
            sub_style.append(('LINEBELOW', (0, i), (-1, i), 0.5, colors.HexColor('#E2E8F0')))
        sub_table.setStyle(TableStyle(sub_style))

        # --- NET TOPLAM (koyu mavi dolgulu vurgu barı) ---
        net_total = quote_data.get('total_net_price', 0)
        net_label_style = ParagraphStyle('NetLabel', parent=self.normal_style,
            fontName=self.get_font_name(is_bold=True), fontSize=12, alignment=TA_LEFT,
            textColor=colors.white, leading=15)
        net_value_style = ParagraphStyle('NetValue', parent=self.normal_style,
            fontName=self.get_font_name(is_bold=True), fontSize=15, alignment=TA_RIGHT,
            textColor=colors.white, leading=18)
        net_table = Table([[
            Paragraph("NET TOPLAM", net_label_style),
            Paragraph(f"₺ {self._format_price_modern(net_total)}", net_value_style)
        ]], colWidths=[5.5*cm, 3.5*cm])
        net_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#2F4B68')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
            ('TOPPADDING', (0, 0), (-1, -1), 12),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
            ('LINEABOVE', (0, 0), (-1, 0), 3, colors.HexColor('#25c7eb')),
        ]))

        # --- EUR / USD karşılıkları (muted alt satır) ---
        fx_rows = []
        try:
            eur_rate = float(currency_service.rates_cache.get('EUR', 37.0)) if currency_service.rates_cache else 37.0
            usd_rate = float(currency_service.rates_cache.get('USD', 34.0)) if currency_service.rates_cache else 34.0
            net_total_eur = net_total / eur_rate
            net_total_usd = net_total / usd_rate
            fx_rows = [[
                Paragraph(f"<i>≈ € {self._format_price_modern(net_total_eur)}</i>", value_muted_style),
                Paragraph(f"<i>≈ $ {self._format_price_modern(net_total_usd)}</i>", value_muted_style)
            ]]
        except Exception as e:
            logger.warning(f"Could not calculate currencies equivalent: {e}")

        # Sağa hizalı sarmalayıcı: ara toplam kutusu + net bar + fx
        wrapper_rows = [[sub_table], [Spacer(1, 6)], [net_table]]
        if fx_rows:
            fx_table = Table(fx_rows, colWidths=[4.5*cm, 4.5*cm])
            fx_table.setStyle(TableStyle([
                ('ALIGN', (0, 0), (0, 0), 'LEFT'),
                ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
                ('LEFTPADDING', (0, 0), (-1, -1), 12),
                ('RIGHTPADDING', (0, 0), (-1, -1), 12),
            ]))
            wrapper_rows.append([fx_table])

        wrapper = Table(wrapper_rows, colWidths=[9.0*cm], hAlign='RIGHT')
        wrapper.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))

        # Sol kolon: önemli notlar kutusu (dikey yer kazanmak için totals ile yan yana)
        notes_box = self._create_footer_notes_box(width=6.6*cm)

        two_col = Table([[notes_box, wrapper]], colWidths=[6.8*cm, 9.2*cm])
        two_col.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (0, 0), 12),
            ('RIGHTPADDING', (1, 0), (1, 0), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))

        # Tüm blok (notlar + ara toplamlar + net bar + döviz) birlikte kalsın
        return [KeepTogether([two_col])]

    def _create_footer_notes_box(self, width=16*cm):
        """Önemli notlar/şartlar kutusu - sol turkuaz vurgulu callout."""
        note_title_style = ParagraphStyle(
            'FooterNotesHeader2', parent=self.styles['Normal'], fontSize=9,
            fontName=self.get_font_name(is_bold=True), textColor=colors.HexColor('#2F4B68'),
            spaceAfter=6,
        )
        compact_footer_style = ParagraphStyle(
            'FooterNotesCompact2', parent=self.footer_style, fontSize=7.5, leading=11, spaceAfter=0,
        )
        notes = [
            "• Fiyatlandırma teklif tarihinden itibaren <b>7 gün geçerlidir.</b>",
            "• Ürün özellikleri ve fiyatları piyasa koşullarına göre değişebilir.",
            "• Montaj/servis dışı işlemlerde montaj ve nakliye ayrıca hesaplanır.",
        ]
        callout_content = [
            Paragraph("<b>ÖNEMLİ NOTLAR VE ŞARTLAR</b>", note_title_style),
            Paragraph("<br/>".join(notes), compact_footer_style),
        ]
        box = Table([[callout_content]], colWidths=[width])
        box.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
            ('LINEBEFORE', (0, 0), (0, -1), 3.5, colors.HexColor('#25c7eb')),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ]))
        return box
    
    def _create_modern_footer(self):
        """Önemli notlar callout'u (tam genişlik) - _create_footer_notes_box ile tutarlı."""
        return [KeepTogether([self._create_footer_notes_box(width=16*cm)])]
    
    def _format_price_modern(self, price):
        """Modern Türkçe fiyat formatla - küsüratsız"""
        try:
            if price is None:
                return "0"
            
            price_float = float(price)
            price_rounded = round(price_float)
            if price_rounded == 0:
                return "0"
                
            # Türkçe format: nokta binlik ayırıcı
            formatted = f"{price_rounded:,}"
            # Binlik ayırıcıyı nokta yap
            formatted = formatted.replace(',', '.')
            return formatted
        except (ValueError, TypeError):
            return "0"
    
    def _format_price(self, price):
        """Eski format - geriye uyumluluk için"""
        return self._format_price_modern(price)

# ===== PDF QUOTE ENDPOINT =====
# ===== PACKAGE PDF GENERATOR =====

class PDFPackageGenerator(PDFQuoteGenerator):
    """Paket PDF oluşturucu - Teklif taslağını kullanan"""
    
    def __init__(self):
        super().__init__()  # PDFQuoteGenerator'dan miras al
        # Eksik style'ları ekle
        self.header_style = ParagraphStyle(
            'PackageHeader',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=10,
            alignment=TA_CENTER,
            textColor=colors.white
        )

    def _format_price_modern(self, price):
        """Modern format ile fiyat gösterimi - küsüratsız"""
        if price is None:
            return "0"
        
        price_float = float(price)
        price_rounded = round(price_float)
        if price_rounded == 0:
            return "0"
            
        formatted = f"{price_rounded:,}".replace(',', '.')
        return formatted

    def generate_package_pdf(self, package_data, products, include_prices=True, categories=None, category_groups=None):
        """Teklif taslağını kullanarak paket PDF'i oluştur"""
        buffer = BytesIO()
        
        # Veriler parametre olarak geçildiyse onları kullan, yoksa boş liste
        if categories is None:
            categories = []
        if category_groups is None:
            category_groups = []
        
        # Yüksek kaliteli PDF ayarları (teklif ile aynı)
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=2.5*cm,
            leftMargin=2.5*cm,
            topMargin=2*cm,
            bottomMargin=2*cm,
            title=f"Paket - {package_data.get('name', 'Adsız')}"
        )
        
        # PDF içeriği
        story = []
        
        # Header (Logo + Firma bilgileri + sağ üst PAKET rozeti)
        story.append(self._create_modern_header(package_data, badge_label="PAKET NO"))
        story.append(Spacer(1, 10))

        # Antetli yatay çizgi
        hr = Table([['']], colWidths=[16*cm], rowHeights=[2])
        hr.setStyle(TableStyle([
            ('LINEBELOW', (0,0), (-1,-1), 1.5, colors.HexColor('#2F4B68')),
            ('BOTTOMPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (-1,-1), 0),
        ]))
        story.append(hr)
        story.append(Spacer(1, 18))

        # Paket başlığı — eyebrow + isim
        package_name = package_data.get('name', 'Paket Bilgisi')
        story.append(Paragraph("ÜRÜN PAKETİ", self.eyebrow_style))
        story.append(Paragraph(f"<b>{package_name}</b>", self.title_style))
        story.append(Spacer(1, 12))

        # Ürün tablosu başlığı
        story.append(Paragraph("<b>Paket İçeriği</b>", self.subtitle_style))
        story.append(Spacer(1, 10))
        
        # Ürün tablosu (kategori grupları ile)
        story.append(self._create_package_products_table_with_groups(products, include_prices, categories, category_groups))
        story.append(Spacer(1, 25))
        
        # Paket notları (varsa - sol turkuaz vurgulu callout kutusu)
        package_notes = package_data.get('notes', '').strip() if package_data.get('notes') else ''
        if package_notes:
            note_title_style = ParagraphStyle('PkgNoteTitle', parent=self.styles['Normal'],
                fontSize=9.5, fontName=self.get_font_name(is_bold=True),
                textColor=colors.HexColor('#2F4B68'), spaceAfter=4)
            note_text_style = ParagraphStyle('PkgNoteText', parent=self.styles['Normal'],
                fontSize=8.5, leading=11.5, textColor=colors.HexColor('#2D3748'),
                fontName=self.get_font_name())
            notes_callout = Table([[[
                Paragraph("<b>Notlar ve Özel Koşullar:</b>", note_title_style),
                Spacer(1, 2),
                Paragraph(package_notes, note_text_style),
            ]]], colWidths=[16*cm])
            notes_callout.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
                ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
                ('LINEBEFORE', (0, 0), (0, -1), 3.5, colors.HexColor('#2F4B68')),
                ('TOPPADDING', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
                ('LEFTPADDING', (0, 0), (-1, -1), 14),
                ('RIGHTPADDING', (0, 0), (-1, -1), 14),
            ]))
            story.append(notes_callout)
            story.append(Spacer(1, 14))
        
        # Toplam hesaplama bölümü (indirim ve işçilik ile)
        if include_prices:
            # Fiyatlı listede indirim ve işçilik hesaplaması
            total_list_price = sum(float(p.get('list_price_try', 0)) * p.get('quantity', 1) for p in products)
            discount_percentage = float(package_data.get('discount_percentage', 0))
            labor_cost = float(package_data.get('labor_cost', 0))
            
            discount_amount = total_list_price * (discount_percentage / 100)
            total_after_discount = total_list_price - discount_amount
            final_total = total_after_discount + labor_cost
            
            story.extend(self._create_package_totals_section_with_discount_labor(
                total_list_price, discount_percentage, discount_amount, labor_cost, final_total
            ))
        else:
            # Fiyatsız listede sadece satış fiyatı
            sale_price = float(package_data.get('sale_price', 0))
            story.extend(self._create_package_totals_section(sale_price, "Paket Satış Fiyatı"))
        
        story.append(Spacer(1, 18))

        # Footer notları
        story.extend(self._create_modern_footer())

        # PDF oluştur (üst brand şeridi + footer her sayfada)
        doc.build(story, onFirstPage=self._draw_page_decorations, onLaterPages=self._draw_page_decorations)
        buffer.seek(0)
        return buffer

    # _create_package_info_section removed - date moved to top-right
    
    def _create_package_products_table(self, products, include_prices=True):
        """Paket ürünleri tablosu - teklif stilinde"""
        from reportlab.platypus import Table as PDFTable
        
        # Tablo başlıkları
        if include_prices:
            headers = ["Ürün Adı", "Adet", "Birim Fiyat", "Toplam"]
            col_widths = [8*cm, 2*cm, 3*cm, 3*cm]
        else:
            headers = ["Ürün Adı", "Adet"]
            col_widths = [12*cm, 3*cm]
        
        # Header row
        header_row = []
        for header in headers:
            header_row.append(Paragraph(f"<b>{header}</b>", self.header_style))
        
        table_data = [header_row]
        
        # Ürün satırları
        for product in products:
            quantity = product.get('quantity', 1)
            product_name = product.get('name', '')
            
            if include_prices:
                unit_price = float(product.get('list_price_try', 0))
                line_total = unit_price * quantity
                
                row = [
                    Paragraph(product_name, self.data_style),
                    Paragraph(str(quantity), self.data_style),
                    Paragraph(f"₺ {self._format_price_modern(unit_price)}", self.data_style),
                    Paragraph(f"₺ {self._format_price_modern(line_total)}", self.data_style)
                ]
            else:
                row = [
                    Paragraph(product_name, self.data_style),
                    Paragraph(str(quantity), self.data_style)
                ]
            
            table_data.append(row)
        
        # Tablo oluştur
        table = PDFTable(table_data, colWidths=col_widths, repeatRows=1)
        
        # Tablo stili (teklif ile aynı)
        table.setStyle(TableStyle([
            # Header stili
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2F4B68')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), self.get_font_name(is_bold=True)),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 0), (-1, 0), 12),
            
            # Veri stili
            ('FONTNAME', (0, 1), (-1, -1), self.get_font_name()),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ALIGN', (0, 1), (0, -1), 'LEFT'),  # Ürün adları sola hizalı
            ('ALIGN', (1, 1), (-1, -1), 'CENTER'),  # Diğer kolonlar orta hizalı
            ('LEFTPADDING', (0, 1), (0, -1), 8),
            ('RIGHTPADDING', (-1, 1), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
            ('TOPPADDING', (0, 1), (-1, -1), 8),
            
            # Kenarlık ve zemin
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F7FAFC')])
        ]))
        
        return table
    
    def _create_package_products_table_with_groups(self, products, include_prices=True, categories=None, category_groups=None):
        """Paket ürünleri tablosu - kategori grupları ile organize edilmiş"""
        from reportlab.platypus import Table as PDFTable
        
        # Kategorileri ve kategori gruplarını kullan (parametre olarak geçildi)
        if categories is None:
            categories = []
        if category_groups is None:
            category_groups = []
        
        # Kategori grup haritası oluştur
        category_to_group = {}
        for group in category_groups:
            for cat_id in group.get("category_ids", []):
                category_to_group[cat_id] = group.get("name", "")
        
        # Ürünleri kategori gruplarına göre grupla
        grouped_products = {}
        for product in products:
            category_id = product.get('category_id')
            category = next((c for c in categories if c.get('id') == category_id), None)
            
            # Kategori grubunu belirle
            if category_id and category_id in category_to_group:
                group_name = category_to_group[category_id]
            elif category:
                group_name = category.get('name', 'Diğer')
            else:
                group_name = 'Kategorisiz'
            
            if group_name not in grouped_products:
                grouped_products[group_name] = []
            grouped_products[group_name].append(product)
        
        # Tablo başlıkları
        if include_prices:
            headers = ["Ürün Adı", "Adet", "Birim Fiyat", "Toplam"]
            col_widths = [8*cm, 2*cm, 3*cm, 3*cm]
        else:
            headers = ["Ürün Adı", "Adet"]
            col_widths = [12*cm, 3*cm]
        
        # Header row
        header_row = []
        for header in headers:
            header_row.append(Paragraph(f"<b>{header}</b>", self.header_style))
        
        table_data = [header_row]
        
        # Grup başlıklarını ve ürünleri ekle
        for group_name, group_products in grouped_products.items():
            # Grup başlığı satırı - küçültülmüş font
            group_header_style = ParagraphStyle(
                'GroupHeader',
                parent=self.styles['Normal'],
                fontName=self.get_font_name(is_bold=True),
                fontSize=7,  # Daha küçük font
                alignment=TA_LEFT,
                textColor=colors.HexColor('#2F4B68'),
                leftIndent=5
            )
            
            if include_prices:
                group_row = [
                    Paragraph(f"<b>{group_name}</b>", group_header_style),
                    Paragraph("", group_header_style),
                    Paragraph("", group_header_style),
                    Paragraph("", group_header_style)
                ]
            else:
                group_row = [
                    Paragraph(f"<b>{group_name}</b>", group_header_style),
                    Paragraph("", group_header_style)
                ]
            
            table_data.append(group_row)
            
            # Grup içindeki ürünler - çok küçültülmüş font
            small_data_style = ParagraphStyle(
                'SmallData',
                parent=self.styles['Normal'],
                fontName=self.get_font_name(),
                fontSize=6,  # Yarıdan da küçük (9'dan 6'ya)
                alignment=TA_LEFT,
                leftIndent=10
            )
            
            for product in group_products:
                quantity = product.get('quantity', 1)
                product_name = product.get('name', '')
                product_notes = product.get('notes', '')
                
                # Ürün adı ile notları birleştir
                display_name = f"• {product_name}"
                if product_notes and product_notes.strip():
                    display_name += f"\n  📝 {product_notes.strip()}"
                
                if include_prices:
                    # PDF için özel fiyat varsa onu kullan, yoksa liste fiyatını kullan
                    if product.get('has_custom_price') and product.get('custom_price'):
                        unit_price = float(product.get('custom_price', 0))
                    else:
                        unit_price = float(product.get('list_price_try', 0))
                    line_total = unit_price * quantity
                    
                    row = [
                        Paragraph(display_name, small_data_style),
                        Paragraph(str(quantity), small_data_style),
                        Paragraph(f"₺ {self._format_price_modern(unit_price)}", small_data_style),
                        Paragraph(f"₺ {self._format_price_modern(line_total)}", small_data_style)
                    ]
                else:
                    row = [
                        Paragraph(display_name, small_data_style),
                        Paragraph(str(quantity), small_data_style)
                    ]
                
                table_data.append(row)
        
        # Tablo oluştur
        table = PDFTable(table_data, colWidths=col_widths, repeatRows=1)
        
        # Tablo stili
        styles_list = [
            # Header stili
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2F4B68')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), self.get_font_name(is_bold=True)),
            ('FONTSIZE', (0, 0), (-1, 0), 8),  # Header da küçültüldü
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),  # Padding küçültüldü
            ('TOPPADDING', (0, 0), (-1, 0), 8),
            
            # Veri stili
            ('FONTNAME', (0, 1), (-1, -1), self.get_font_name()),
            ('FONTSIZE', (0, 1), (-1, -1), 6),  # Çok küçültüldü
            ('ALIGN', (0, 1), (0, -1), 'LEFT'),  # Ürün adları sola hizalı
            ('ALIGN', (1, 1), (-1, -1), 'CENTER'),  # Diğer kolonlar orta hizalı
            ('LEFTPADDING', (0, 1), (0, -1), 4),  # Padding küçültüldü
            ('RIGHTPADDING', (-1, 1), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 3),
            ('TOPPADDING', (0, 1), (-1, -1), 3),
            
            # Kenarlık ve zemin
            ('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor('#E2E8F0')),  # İnce kenarlık
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9FAFB')])
        ]
        
        # Grup başlıkları için özel stil ekle
        row_idx = 1  # Header'dan sonra
        for group_name, group_products in grouped_products.items():
            # Grup başlığı satırı için özel background
            styles_list.append(('BACKGROUND', (0, row_idx), (-1, row_idx), colors.HexColor('#EDF2F7')))
            styles_list.append(('FONTSIZE', (0, row_idx), (-1, row_idx), 7))
            row_idx += 1  # Grup başlığı
            row_idx += len(group_products)  # Grup ürünleri
        
        table.setStyle(TableStyle(styles_list))
        
        return table

    def _create_package_totals_section_with_discount_labor(self, total_list_price, discount_percentage, discount_amount, labor_cost, final_total):
        """Paket fiyat hesaplaması - teklif ile aynı NET TOPLAM bar stili."""
        label_style = ParagraphStyle('PkgTotLabel', parent=self.normal_style,
            fontName=self.get_font_name(), fontSize=9.5, alignment=TA_LEFT, leading=12)
        value_style = ParagraphStyle('PkgTotValue', parent=self.normal_style,
            fontName=self.get_font_name(), fontSize=9.5, alignment=TA_RIGHT, leading=12)
        value_muted_style = ParagraphStyle('PkgTotMuted', parent=self.normal_style,
            fontName=self.get_font_name(), fontSize=8, alignment=TA_RIGHT,
            textColor=colors.HexColor('#718096'), leading=10)

        # --- Ara toplamlar (açık zeminli kutu) ---
        sub_data = [[
            Paragraph("Toplam Liste Fiyatı", label_style),
            Paragraph(f"₺ {self._format_price_modern(total_list_price)}", value_style)
        ]]
        if discount_percentage > 0:
            sub_data.append([
                Paragraph(f"İndirim (%{discount_percentage})", label_style),
                Paragraph(f"<font color='#dc2626'>− ₺ {self._format_price_modern(discount_amount)}</font>", value_style)
            ])
        if labor_cost > 0:
            sub_data.append([
                Paragraph("İşçilik Maliyeti", label_style),
                Paragraph(f"<font color='#059669'>+ ₺ {self._format_price_modern(labor_cost)}</font>", value_style)
            ])

        sub_table = Table(sub_data, colWidths=[5.5*cm, 3.5*cm])
        sub_style = [
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 7),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
        ]
        for i in range(len(sub_data) - 1):
            sub_style.append(('LINEBELOW', (0, i), (-1, i), 0.5, colors.HexColor('#E2E8F0')))
        sub_table.setStyle(TableStyle(sub_style))

        # --- NET TOPLAM (koyu mavi dolgulu vurgu barı) ---
        net_label_style = ParagraphStyle('PkgNetLabel', parent=self.normal_style,
            fontName=self.get_font_name(is_bold=True), fontSize=12, alignment=TA_LEFT,
            textColor=colors.white, leading=15)
        net_value_style = ParagraphStyle('PkgNetValue', parent=self.normal_style,
            fontName=self.get_font_name(is_bold=True), fontSize=15, alignment=TA_RIGHT,
            textColor=colors.white, leading=18)
        net_table = Table([[
            Paragraph("NET TOPLAM", net_label_style),
            Paragraph(f"₺ {self._format_price_modern(final_total)}", net_value_style)
        ]], colWidths=[5.5*cm, 3.5*cm])
        net_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#2F4B68')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
            ('TOPPADDING', (0, 0), (-1, -1), 12),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
            ('LINEABOVE', (0, 0), (-1, 0), 3, colors.HexColor('#25c7eb')),
        ]))

        # --- EUR karşılığı (muted) ---
        fx_table = None
        try:
            eur_rate = float(currency_service.rates_cache.get('EUR', 48.5)) if currency_service.rates_cache else 48.5
            final_total_eur = final_total / eur_rate
            fx_table = Table([[Paragraph(f"<i>≈ € {self._format_price_modern(final_total_eur)}</i>", value_muted_style)]],
                             colWidths=[9.0*cm])
            fx_table.setStyle(TableStyle([
                ('ALIGN', (0, 0), (0, 0), 'RIGHT'),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
                ('RIGHTPADDING', (0, 0), (-1, -1), 12),
            ]))
        except Exception as e:
            logger.warning(f"Could not calculate EUR equivalent: {e}")

        wrapper_rows = [[sub_table], [Spacer(1, 6)], [net_table]]
        if fx_table is not None:
            wrapper_rows.append([fx_table])
        wrapper = Table(wrapper_rows, colWidths=[9.0*cm], hAlign='RIGHT')
        wrapper.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))

        return [Paragraph("<b>Paket Fiyat Hesaplaması</b>", self.subtitle_style), Spacer(1, 8), KeepTogether([wrapper])]
    
    def _create_package_totals_section(self, amount, label):
        """Paket toplam bölümü"""
        from reportlab.platypus import Table as PDFTable
        
        # Toplam tablosu
        totals_data = [
            [label, f"₺ {self._format_price_modern(amount)}"]
        ]
        
        totals_table = PDFTable(totals_data, colWidths=[10*cm, 6*cm])
        totals_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, 0), 'RIGHT'),
            ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, -1), self.get_font_name(is_bold=True)),
            ('FONTSIZE', (0, 0), (-1, -1), 12),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#2F4B68')),
            ('LINEABOVE', (0, 0), (-1, 0), 1, colors.HexColor('#2F4B68')),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ]))
        
        return [totals_table]

# ===== PACKAGE PDF ENDPOINTS =====

@app.get("/api/packages/{package_id}/pdf-with-prices")
async def download_package_pdf_with_prices(package_id: str):
    """Paket PDF'i indir - ürün isimleri ve liste fiyatları ile"""
    try:
        # Paket ve ürünleri getir
        package = await db.packages.find_one({"id": package_id})
        if not package:
            raise HTTPException(status_code=404, detail="Paket bulunamadı")
        
        # Paket ürünlerini getir
        package_products = await db.package_products.find({"package_id": package_id}).to_list(None)
        
        # Ürün detaylarını al
        products = []
        for pp in package_products:
            product = await db.products.find_one({"id": pp["product_id"]})
            if product:
                # Use custom price if available, otherwise use original prices
                custom_price = pp.get("custom_price")
                
                if custom_price is not None:
                    # Custom price is set for this product in the package
                    effective_price_try = float(custom_price)
                else:
                    # Use LIST PRICE (not discounted price) - PDF için liste fiyatı
                    effective_price_try = float(product.get("list_price_try", 0))
                
                product_data = {
                    "name": product["name"],
                    "quantity": pp["quantity"],
                    "list_price_try": effective_price_try,  # Use effective price (custom or original)
                    "category_id": product.get("category_id"),  # Kategori bilgisi eklendi
                    "custom_price": custom_price,  # PDF generator'a custom price bilgisi
                    "has_custom_price": custom_price is not None,  # PDF'de gösterim için
                    "notes": pp.get("notes"),  # Ürün notları PDF'de gösterilecek
                    "has_notes": bool(pp.get("notes") and pp.get("notes").strip())  # Not var mı?
                }
                products.append(product_data)
        
        # Kategorileri ve kategori gruplarını önceden getir
        categories = await db.categories.find().to_list(None)
        category_groups = await db.category_groups.find().to_list(None)
        
        # PDF oluştur
        generator = PDFPackageGenerator()
        pdf_buffer = generator.generate_package_pdf(package, products, include_prices=True, categories=categories, category_groups=category_groups)
        
        # Dosya adı - Turkish character safe
        safe_name = package["name"].encode('ascii', 'ignore').decode('ascii')
        if not safe_name:
            safe_name = "paket"
        filename = f"paket_{safe_name}_fiyatli.pdf"
        
        return StreamingResponse(
            io.BytesIO(pdf_buffer.read()),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating package PDF with prices: {e}")
        raise HTTPException(status_code=500, detail="PDF oluşturulamadı")

@app.get("/api/packages/{package_id}/pdf-without-prices")
async def download_package_pdf_without_prices(package_id: str):
    """Paket PDF'i indir - sadece ürün isimleri ile"""
    try:
        # Paket ve ürünleri getir
        package = await db.packages.find_one({"id": package_id})
        if not package:
            raise HTTPException(status_code=404, detail="Paket bulunamadı")
        
        # Paket ürünlerini getir
        package_products = await db.package_products.find({"package_id": package_id}).to_list(None)
        
        # Ürün detaylarını al
        products = []
        for pp in package_products:
            product = await db.products.find_one({"id": pp["product_id"]})
            if product:
                product_data = {
                    "name": product["name"],
                    "quantity": pp["quantity"],
                    "category_id": product.get("category_id"),  # Kategori bilgisi eklendi
                    "notes": pp.get("notes"),  # Ürün notları PDF'de gösterilecek
                    "has_notes": bool(pp.get("notes") and pp.get("notes").strip())  # Not var mı?
                }
                products.append(product_data)
        
        # Kategorileri ve kategori gruplarını önceden getir
        categories = await db.categories.find().to_list(None)
        category_groups = await db.category_groups.find().to_list(None)
        
        # PDF oluştur
        generator = PDFPackageGenerator()
        pdf_buffer = generator.generate_package_pdf(package, products, include_prices=False, categories=categories, category_groups=category_groups)
        
        # Dosya adı - Turkish character safe
        safe_name = package["name"].encode('ascii', 'ignore').decode('ascii')
        if not safe_name:
            safe_name = "paket"
        filename = f"paket_{safe_name}_liste.pdf"
        
        return StreamingResponse(
            io.BytesIO(pdf_buffer.read()),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating package PDF without prices: {e}")
        raise HTTPException(status_code=500, detail="PDF oluşturulamadı")


@app.get("/api/quotes/{quote_id}/pdf")
async def download_quote_pdf(quote_id: str):
    """Teklif PDF'ini indir"""
    try:
        db = await get_db()
        quote = await db.quotes.find_one({"id": quote_id})
        
        if not quote:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        # PDF oluştur
        pdf_generator = PDFQuoteGenerator()
        pdf_buffer = pdf_generator.create_quote_pdf(quote)
        
        # Response headers - ensure proper encoding for Turkish characters
        safe_filename = quote["name"].encode('ascii', 'ignore').decode('ascii')
        if not safe_filename:
            safe_filename = "teklif"
        
        headers = {
            'Content-Type': 'application/pdf',
            'Content-Disposition': f'attachment; filename="{safe_filename}.pdf"'
        }
        
        return StreamingResponse(
            BytesIO(pdf_buffer.read()),
            media_type='application/pdf',
            headers=headers
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating PDF: {e}")
        raise HTTPException(status_code=500, detail="PDF oluşturulurken hata oluştu")

# Category endpoints
@api_router.post("/categories", response_model=Category)
async def create_category(category: CategoryCreate):
    """Create a new category"""
    try:
        category_dict = {
            "id": str(uuid.uuid4()),
            "name": category.name,
            "description": category.description,
            "color": category.color or "#3B82F6",  # Default blue color
            "image_url": category.image_url,
            "sort_order": category.sort_order or 0,
            "created_at": datetime.now(timezone.utc)
        }
        
        result = await db.categories.insert_one(category_dict)
        invalidate_cache("categories")
        return Category(**category_dict)
        
    except Exception as e:
        logger.error(f"Error creating category: {e}")
        raise HTTPException(status_code=500, detail="Kategori oluşturulamadı")

@api_router.get("/categories", response_model=List[Category])
async def get_categories():
    """Get all categories sorted by sort_order, then by name"""
    try:
        # Kategorileri önce sort_order'a, sonra name'e göre sırala
        categories = await db.categories.find().sort([("sort_order", 1), ("name", 1)]).to_list(None)
        return [Category(**category) for category in categories]
    except Exception as e:
        logger.error(f"Error getting categories: {e}")
        raise HTTPException(status_code=500, detail="Kategoriler getirilemedi")

@api_router.patch("/categories/{category_id}")
async def update_category(category_id: str, update_data: CategoryCreate):
    """Update a category"""
    try:
        update_dict = {}
        if update_data.name:
            update_dict["name"] = update_data.name
        if update_data.description is not None:
            update_dict["description"] = update_data.description
        if update_data.color:
            update_dict["color"] = update_data.color
        if update_data.sort_order is not None:
            update_dict["sort_order"] = update_data.sort_order
        if update_data.image_url is not None:
            update_dict["image_url"] = update_data.image_url
        
        if update_dict:
            result = await db.categories.update_one(
                {"id": category_id},
                {"$set": update_dict}
            )
            
            if result.matched_count == 0:
                raise HTTPException(status_code=404, detail="Kategori bulunamadı")
        
        invalidate_cache("categories")
        # Get updated category
        updated_category = await db.categories.find_one({"id": category_id})
        return {
            "success": True,
            "message": "Kategori başarıyla güncellendi",
            "category": Category(**updated_category) if updated_category else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating category: {e}")
        raise HTTPException(status_code=500, detail="Kategori güncellenemedi")

@api_router.post("/categories/reorder")
async def reorder_categories(category_orders: List[Dict[str, Any]]):
    """Kategorilerin sırasını toplu güncelle"""
    try:
        # category_orders: [{"id": "cat1", "sort_order": 1}, {"id": "cat2", "sort_order": 2}, ...]
        for item in category_orders:
            category_id = item.get("id")
            sort_order = item.get("sort_order", 0)
            
            if category_id:
                await db.categories.update_one(
                    {"id": category_id},
                    {"$set": {"sort_order": sort_order}}
                )
        
        invalidate_cache("categories")
        # Return updated categories sorted by new order
        categories = await db.categories.find().sort([("sort_order", 1), ("name", 1)]).to_list(None)
        return {
            "success": True,
            "message": "Kategori sıralaması güncellendi",
            "categories": [Category(**category) for category in categories]
        }
        
    except Exception as e:
        logger.error(f"Error reordering categories: {e}")
        raise HTTPException(status_code=500, detail="Kategori sıralaması güncellenemedi")

@api_router.delete("/categories/{category_id}")
async def delete_category(category_id: str):
    """Delete a category"""
    try:
        # Check if category exists and is deletable
        category = await db.categories.find_one({"id": category_id})
        if not category:
            raise HTTPException(status_code=404, detail="Kategori bulunamadı")
        
        # Check if category is deletable
        if not category.get("is_deletable", True):
            raise HTTPException(status_code=400, detail="Bu kategori silinemez")
        
        # First, remove this category from all products
        await db.products.update_many(
            {"category_id": category_id},
            {"$unset": {"category_id": ""}}
        )
        
        # Then delete the category
        result = await db.categories.delete_one({"id": category_id})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Kategori bulunamadı")
        
        invalidate_cache("categories")
        return {"success": True, "message": "Kategori başarıyla silindi"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting category: {e}")
        raise HTTPException(status_code=500, detail="Kategori silinemedi")

@api_router.post("/packages/{package_id}/supplies")
async def add_supplies_to_package(package_id: str, supplies: List[PackageSupplyCreate]):
    """Pakete sarf malzemesi ekle"""
    try:
        # Check if package exists
        package = await db.packages.find_one({"id": package_id})
        if not package:
            raise HTTPException(status_code=404, detail="Paket bulunamadı")
        
        # Remove existing supplies
        await db.package_supplies.delete_many({"package_id": package_id})
        
        # Add new supplies
        package_supplies = []
        for supply in supplies:
            # Verify product exists
            existing_product = await db.products.find_one({"id": supply.product_id})
            if not existing_product:
                continue
                
            package_supply = {
                "id": str(uuid.uuid4()),
                "package_id": package_id,
                "product_id": supply.product_id,
                "quantity": supply.quantity,
                "note": supply.note,
                "created_at": datetime.now(timezone.utc)
            }
            package_supplies.append(package_supply)
        
        if package_supplies:
            await db.package_supplies.insert_many(package_supplies)
        
        return {"success": True, "message": f"{len(package_supplies)} sarf malzemesi pakete eklendi"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding supplies to package: {e}")
        raise HTTPException(status_code=500, detail="Sarf malzemeleri pakete eklenemedi")

@api_router.delete("/packages/{package_id}/supplies/{supply_id}")
async def remove_supply_from_package(package_id: str, supply_id: str):
    """Paketten sarf malzemesi çıkar"""
    try:
        # supply_id actually refers to product_id in this context
        result = await db.package_supplies.delete_one({
            "product_id": supply_id,  # Changed from "id" to "product_id"
            "package_id": package_id
        })
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Sarf malzemesi bulunamadı")
        
        return {"success": True, "message": "Sarf malzemesi paketten çıkarıldı"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing supply from package: {e}")
        raise HTTPException(status_code=500, detail="Sarf malzemesi paketten çıkarılamadı")

@api_router.put("/packages/{package_id}/supplies/{supply_id}")
async def update_supply_quantity(package_id: str, supply_id: str, quantity: int):
    """Sarf malzemesi adetini güncelle"""
    try:
        if quantity <= 0:
            raise HTTPException(status_code=400, detail="Adet 1'den küçük olamaz")
        
        # supply_id actually refers to product_id in this context
        result = await db.package_supplies.update_one(
            {"product_id": supply_id, "package_id": package_id},  # Changed from "id" to "product_id"
            {"$set": {"quantity": quantity}}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Sarf malzemesi bulunamadı")
        
        return {"success": True, "message": "Sarf malzemesi adeti güncellendi"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating supply quantity: {e}")
        raise HTTPException(status_code=500, detail="Sarf malzemesi adeti güncellenemedi")

@api_router.delete("/packages/{package_id}/products/{package_product_id}")
async def remove_product_from_package(package_id: str, package_product_id: str):
    """Paketten ürün çıkar"""
    try:
        result = await db.package_products.delete_one({
            "id": package_product_id,
            "package_id": package_id
        })
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Paket ürünü bulunamadı")
        
        return {"success": True, "message": "Ürün paketten çıkarıldı"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing product from package: {e}")
        raise HTTPException(status_code=500, detail="Ürün paketten çıkarılamadı")
        raise
    except Exception as e:
        logger.error(f"Error deleting category: {e}")
        raise HTTPException(status_code=500, detail="Kategori silinemedi")

@api_router.get("/products/supplies")
async def get_supply_products():
    """Get products from 'Sarf Malzemeleri' category only"""
    try:
        # Get Sarf Malzemeleri category
        supplies_category = await db.categories.find_one({"name": "Sarf Malzemeleri"})
        if not supplies_category:
            return []
        
        # Get products from supplies category
        products = await db.products.find({
            "category_id": supplies_category["id"]
        }).sort("name", 1).to_list(None)
        
        return [Product(**product) for product in products]
    except Exception as e:
        logger.error(f"Error getting supply products: {e}")
        raise HTTPException(status_code=500, detail="Sarf malzemesi ürünleri getirilemedi")
        raise
    except Exception as e:
        logger.error(f"Error deleting category: {e}")
        raise HTTPException(status_code=500, detail="Kategori silinemedi")

@api_router.post("/products/{product_id}/assign-category")
async def assign_product_to_category(product_id: str, category_id: str = None):
    """Assign a product to a category"""
    try:
        update_dict = {"category_id": category_id} if category_id else {"$unset": {"category_id": ""}}
        
        result = await db.products.update_one(
            {"id": product_id},
            update_dict if category_id else {"$unset": {"category_id": ""}}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Ürün bulunamadı")
        
        return {"success": True, "message": "Ürün kategoriye atandı"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error assigning product to category: {e}")
        raise HTTPException(status_code=500, detail="Ürün kategoriye atanamadı")

@api_router.post("/products/{product_id}/toggle-favorite")
async def toggle_product_favorite(product_id: str):
    """Toggle a product's favorite status"""
    try:
        # Get current product
        current_product = await db.products.find_one({"id": product_id})
        if not current_product:
            raise HTTPException(status_code=404, detail="Ürün bulunamadı")
        
        # Toggle favorite status
        current_favorite = current_product.get("is_favorite", False)
        new_favorite = not current_favorite
        
        result = await db.products.update_one(
            {"id": product_id},
            {"$set": {"is_favorite": new_favorite}}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Ürün bulunamadı")
        
        status_message = "favorilere eklendi" if new_favorite else "favorilerden çıkarıldı"
        return {
            "success": True, 
            "message": f"Ürün {status_message}",
            "is_favorite": new_favorite
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling product favorite: {e}")
        raise HTTPException(status_code=500, detail="Favori durumu güncellenemedi")

@api_router.post("/products/{product_id}/favorite")
async def toggle_product_favorite_v2(product_id: str):
    """Toggle favorite status of a product"""
    try:
        # Get current product
        product = await db.products.find_one({"id": product_id})
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        
        # Toggle favorite status
        new_favorite_status = not product.get("is_favorite", False)
        
        update_data = {"is_favorite": new_favorite_status}
        
        # If removing from favorites, clear stock quantity
        if not new_favorite_status:
            update_data["stock_quantity"] = None
        
        await db.products.update_one(
            {"id": product_id},
            {"$set": update_data}
        )
        
        return {"success": True, "is_favorite": new_favorite_status}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling product favorite: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@api_router.post("/products/{product_id}/stock")
async def update_product_stock(product_id: str, stock_quantity: int = Form(...)):
    """Update stock quantity for a favorite product"""
    try:
        # Get current product
        product = await db.products.find_one({"id": product_id})
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        
        # Check if product is favorite
        if not product.get("is_favorite", False):
            raise HTTPException(status_code=400, detail="Stok sadece favori ürünler için takip edilir")
        
        # Update stock quantity
        await db.products.update_one(
            {"id": product_id},
            {"$set": {"stock_quantity": stock_quantity}}
        )
        
        return {
            "success": True, 
            "message": "Stok miktarı güncellendi",
            "stock_quantity": stock_quantity
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating product stock: {e}")
        raise HTTPException(status_code=500, detail="Stok güncellenirken hata oluştu")
@api_router.get("/products/favorites", response_model=List[Product])
async def get_favorite_products():
    """Get all favorite products"""
    try:
        products = await db.products.find({"is_favorite": True}).sort("name", 1).to_list(None)
        return [Product(**product) for product in products]
    except Exception as e:
        logger.error(f"Error getting favorite products: {e}")
        raise HTTPException(status_code=500, detail="Favori ürünler getirilemedi")

# Package endpoints
@api_router.post("/packages", response_model=Package)
async def create_package(package: PackageCreate):
    """Create a new package"""
    try:
        package_data = package.dict()
        package_data["id"] = str(uuid.uuid4())
        package_data["created_at"] = datetime.now(timezone.utc)
        
        # Convert Decimal to float for MongoDB compatibility
        if "sale_price" in package_data and package_data["sale_price"] is not None:
            package_data["sale_price"] = float(package_data["sale_price"])
        
        result = await db.packages.insert_one(package_data)
        if result.inserted_id:
            created_package = await db.packages.find_one({"id": package_data["id"]})
            return Package(**created_package)
        else:
            raise HTTPException(status_code=500, detail="Paket oluşturulamadı")
    except Exception as e:
        logger.error(f"Error creating package: {e}")
        raise HTTPException(status_code=500, detail="Paket oluşturulamadı")

@api_router.get("/packages", response_model=List[Package])
async def get_packages():
    """Get all packages sorted with pinned packages first"""
    try:
        # Get packages sorted by pin status (pinned first) then by creation date (newest first)
        packages = await db.packages.find({}).sort([
            ("is_pinned", -1),  # Pinned packages first (True = -1 comes before False = 0)
            ("created_at", -1)   # Then by creation date, newest first
        ]).to_list(None)
        
        return [Package(**package) for package in packages]
    except Exception as e:
        logger.error(f"Error getting packages: {e}")
        raise HTTPException(status_code=500, detail="Paketler getirilemedi")

@api_router.put("/packages/{package_id}")
async def update_package(package_id: str, package_data: PackageUpdate):
    """Update a package"""
    try:
        # Check if package exists
        existing_package = await db.packages.find_one({"id": package_id})
        if not existing_package:
            raise HTTPException(status_code=404, detail="Paket bulunamadı")
        
        # Prepare update data (only include non-None fields)
        update_fields = {}
        
        if package_data.name is not None:
            update_fields["name"] = package_data.name
        if package_data.description is not None:
            update_fields["description"] = package_data.description
        if package_data.sale_price is not None:
            update_fields["sale_price"] = float(package_data.sale_price)
        if package_data.discount_percentage is not None:
            update_fields["discount_percentage"] = package_data.discount_percentage
        if package_data.labor_cost is not None:
            update_fields["labor_cost"] = package_data.labor_cost
        if package_data.notes is not None:
            update_fields["notes"] = package_data.notes
        if package_data.image_url is not None:
            update_fields["image_url"] = package_data.image_url
        if package_data.is_pinned is not None:
            update_fields["is_pinned"] = package_data.is_pinned
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="Güncellenecek veri bulunamadı")
        
        # Add updated timestamp
        update_fields["updated_at"] = datetime.now(timezone.utc)
        
        # Update package
        result = await db.packages.update_one(
            {"id": package_id},
            {"$set": update_fields}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Paket bulunamadı")
        
        # Get updated package
        updated_package = await db.packages.find_one({"id": package_id})
        
        return {
            "success": True,
            "message": f"'{updated_package['name']}' paketi başarıyla güncellendi",
            "package": Package(**updated_package)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating package: {e}")
        raise HTTPException(status_code=500, detail="Paket güncellenemedi")

@api_router.get("/packages/{package_id}", response_model=PackageWithProducts)
async def get_package_with_products(package_id: str):
    """Get package with its products"""
    try:
        # Get package
        package = await db.packages.find_one({"id": package_id})
        if not package:
            raise HTTPException(status_code=404, detail="Paket bulunamadı")
        
        # Get package products
        package_products = await db.package_products.find({"package_id": package_id}).to_list(None)
        
        # Get product details and calculate totals
        products = []
        total_discounted_price = Decimal('0')
        
        for pp in package_products:
            product = await db.products.find_one({"id": pp["product_id"]})
            if product:
                # Use custom price if available, otherwise use original prices
                custom_price = pp.get("custom_price")
                
                if custom_price is not None:
                    # Custom price is set for this product in the package
                    effective_price_try = Decimal(str(custom_price))
                    list_price_try_value = custom_price
                    discounted_price_try_value = custom_price
                    effective_discounted_price = custom_price
                    effective_list_price = custom_price
                else:
                    # Use original product prices - keep them separate
                    list_price_try_value = float(product.get("list_price_try", 0))
                    discounted_price_try_value = float(product.get("discounted_price_try") or product.get("list_price_try", 0))
                    effective_price_try = Decimal(str(discounted_price_try_value))  # For totals calculation
                    effective_discounted_price = product.get("discounted_price")
                    effective_list_price = product.get("list_price", 0)
                
                product_data = {
                    "id": product["id"],
                    "name": product["name"],
                    "list_price": effective_list_price,
                    "discounted_price": effective_discounted_price,
                    "list_price_try": list_price_try_value,
                    "discounted_price_try": discounted_price_try_value,
                    "currency": product.get("currency", "USD"),
                    "quantity": pp["quantity"],
                    "company_id": product.get("company_id"),
                    "category_id": product.get("category_id"),
                    "package_product_id": pp["id"],  # Paket ürün ID'si (güncelleme için)
                    "custom_price": custom_price,  # Özel fiyat (varsa)
                    "has_custom_price": custom_price is not None,  # Özel fiyat var mı?
                    "notes": pp.get("notes"),  # Ürün notları
                    "has_notes": bool(pp.get("notes") and pp.get("notes").strip())  # Not var mı?
                }
                products.append(product_data)
                
                # Calculate total using effective price
                total_discounted_price += effective_price_try * pp["quantity"]

        # Get package supplies (sarf malzemeleri)
        package_supplies = await db.package_supplies.find({"package_id": package_id}).to_list(None)
        
        # Get supply details and calculate totals
        supplies = []
        total_supplies_price = Decimal('0')
        
        for ps in package_supplies:
            supply = await db.products.find_one({"id": ps["product_id"]})
            if supply:
                supply_data = {
                    "id": supply["id"],
                    "name": supply["name"],
                    "list_price": supply.get("list_price", 0),
                    "discounted_price": supply.get("discounted_price"),
                    "list_price_try": supply.get("list_price_try", 0),
                    "discounted_price_try": supply.get("discounted_price_try"),
                    "currency": supply.get("currency", "USD"),
                    "quantity": ps["quantity"],
                    "note": ps.get("note", ""),
                    "company_id": supply.get("company_id"),
                    "category_id": supply.get("category_id")
                }
                supplies.append(supply_data)
                
                # Calculate supply price total
                if supply.get("discounted_price_try"):
                    total_supplies_price += Decimal(str(supply["discounted_price_try"])) * ps["quantity"]
                else:
                    total_supplies_price += Decimal(str(supply.get("list_price_try", 0))) * ps["quantity"]
        
        return PackageWithProducts(
            id=package["id"],
            name=package["name"],
            description=package.get("description"),
            sale_price=package["sale_price"],
            discount_percentage=package.get("discount_percentage", 0),  # İndirim yüzdesi eklendi
            labor_cost=package.get("labor_cost", 0),  # İşçilik maliyeti eklendi
            notes=package.get("notes"),  # Paket notları eklendi
            image_url=package.get("image_url"),
            created_at=package["created_at"],
            products=products,
            supplies=supplies,
            total_discounted_price=total_discounted_price,
            total_discounted_price_with_supplies=total_discounted_price + total_supplies_price,
            status="active"  # Default status
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting package with products: {e}")
        raise HTTPException(status_code=500, detail="Paket detayları getirilemedi")

@api_router.put("/packages/{package_id}", response_model=Package)
async def update_package(package_id: str, package: PackageCreate):
    """Update a package"""
    try:
        update_data = package.dict(exclude_unset=True)
        
        # Convert Decimal to float for MongoDB compatibility
        if "sale_price" in update_data and update_data["sale_price"] is not None:
            update_data["sale_price"] = float(update_data["sale_price"])
        
        result = await db.packages.update_one(
            {"id": package_id},
            {"$set": update_data}
        )
        
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Paket bulunamadı")
        
        updated_package = await db.packages.find_one({"id": package_id})
        return Package(**updated_package)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating package: {e}")
        raise HTTPException(status_code=500, detail="Paket güncellenemedi")

@api_router.post("/packages/{package_id}/pin")
async def toggle_package_pin(package_id: str):
    """Toggle pin status of a package"""
    try:
        # Get current package
        package = await db.packages.find_one({"id": package_id})
        if not package:
            raise HTTPException(status_code=404, detail="Package not found")
        
        # Toggle pin status
        new_pin_status = not package.get("is_pinned", False)
        
        await db.packages.update_one(
            {"id": package_id},
            {"$set": {"is_pinned": new_pin_status}}
        )
        
        action = "sabitlendi" if new_pin_status else "sabitleme kaldırıldı"
        
        return {
            "success": True,
            "message": f"Paket başarıyla {action}",
            "is_pinned": new_pin_status,
            "package_name": package["name"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling package pin: {e}")
        raise HTTPException(status_code=500, detail="Paket sabitleme durumu değiştirilemedi")

@api_router.post("/packages/{package_id}/copy")
async def copy_package(package_id: str, new_name: str = Form(...)):
    """Copy a package with all its products and supplies"""
    try:
        # Get original package
        original_package = await db.packages.find_one({"id": package_id})
        if not original_package:
            raise HTTPException(status_code=404, detail="Package not found")
        
        # Check if new name already exists
        existing_package = await db.packages.find_one({"name": new_name})
        if existing_package:
            raise HTTPException(status_code=400, detail="Bu isimde bir paket zaten mevcut")
        
        # Create new package with copied data
        new_package_id = str(uuid.uuid4())
        new_package = {
            "id": new_package_id,
            "name": new_name,
            "description": original_package.get("description", ""),
            "sale_price": original_package.get("sale_price", "0"),
            "image_url": original_package.get("image_url"),
            "created_at": datetime.now(timezone.utc)
        }
        
        await db.packages.insert_one(new_package)
        logger.info(f"Created package copy: {new_name} (ID: {new_package_id})")
        
        # Copy package products
        original_products = await db.package_products.find({"package_id": package_id}).to_list(length=None)
        if original_products:
            copied_products = []
            for product in original_products:
                copied_product = {
                    "id": str(uuid.uuid4()),
                    "package_id": new_package_id,
                    "product_id": product["product_id"],
                    "quantity": product["quantity"],
                    "created_at": datetime.now(timezone.utc)
                }
                copied_products.append(copied_product)
            
            await db.package_products.insert_many(copied_products)
            logger.info(f"Copied {len(copied_products)} products to new package")
        
        # Copy package supplies
        original_supplies = await db.package_supplies.find({"package_id": package_id}).to_list(length=None)
        if original_supplies:
            copied_supplies = []
            for supply in original_supplies:
                copied_supply = {
                    "id": str(uuid.uuid4()),
                    "package_id": new_package_id,
                    "product_id": supply["product_id"],
                    "quantity": supply["quantity"],
                    "created_at": datetime.now(timezone.utc)
                }
                copied_supplies.append(copied_supply)
            
            await db.package_supplies.insert_many(copied_supplies)
            logger.info(f"Copied {len(copied_supplies)} supplies to new package")
        
        return {
            "success": True, 
            "message": f"Paket başarıyla kopyalandı: {new_name}",
            "new_package_id": new_package_id,
            "original_package_name": original_package["name"],
            "new_package_name": new_name,
            "copied_products": len(original_products) if original_products else 0,
            "copied_supplies": len(original_supplies) if original_supplies else 0
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error copying package: {e}")
        raise HTTPException(status_code=500, detail="Paket kopyalanırken hata oluştu")

@api_router.delete("/packages/{package_id}")
async def delete_package(package_id: str):
    """Delete a package and its products"""
    try:
        # Delete package products and supplies first
        await db.package_products.delete_many({"package_id": package_id})
        await db.package_supplies.delete_many({"package_id": package_id})
        
        # Delete package
        result = await db.packages.delete_one({"id": package_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Paket bulunamadı")
        
        return {"success": True, "message": "Paket başarıyla silindi"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting package: {e}")
        raise HTTPException(status_code=500, detail="Paket silinemedi")

@api_router.post("/packages/{package_id}/products")
async def add_products_to_package(package_id: str, products: List[PackageProductCreate]):
    """Add products to a package"""
    try:
        # Check if package exists
        package = await db.packages.find_one({"id": package_id})
        if not package:
            raise HTTPException(status_code=404, detail="Paket bulunamadı")
        
        # Remove existing products
        await db.package_products.delete_many({"package_id": package_id})
        
        # Add new products
        package_products = []
        for product in products:
            # Verify product exists
            existing_product = await db.products.find_one({"id": product.product_id})
            if not existing_product:
                continue
                
            package_product = {
                "id": str(uuid.uuid4()),
                "package_id": package_id,
                "product_id": product.product_id,
                "quantity": product.quantity,
                "custom_price": float(product.custom_price) if product.custom_price is not None else None,
                "notes": product.notes,  # Ürün notları
                "created_at": datetime.now(timezone.utc)
            }
            package_products.append(package_product)
        
        if package_products:
            await db.package_products.insert_many(package_products)
        
        return {"success": True, "message": f"{len(package_products)} ürün pakete eklendi"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding products to package: {e}")
        raise HTTPException(status_code=500, detail="Ürünler pakete eklenemedi")

@api_router.put("/packages/{package_id}/products/{package_product_id}")
async def update_package_product(package_id: str, package_product_id: str, update_data: PackageProductUpdate):
    """Update a specific product in a package (quantity and/or custom price)"""
    try:
        # Check if package exists
        package = await db.packages.find_one({"id": package_id})
        if not package:
            raise HTTPException(status_code=404, detail="Paket bulunamadı")
        
        # Check if package product exists
        package_product = await db.package_products.find_one({
            "id": package_product_id,
            "package_id": package_id
        })
        if not package_product:
            raise HTTPException(status_code=404, detail="Paket ürünü bulunamadı")
        
        # Prepare update data
        update_fields = {}
        if update_data.quantity is not None:
            update_fields["quantity"] = update_data.quantity
        if update_data.custom_price is not None:
            update_fields["custom_price"] = float(update_data.custom_price)
        elif hasattr(update_data, 'custom_price') and update_data.custom_price is None:
            # Explicitly set to None to remove custom price
            update_fields["custom_price"] = None
        if update_data.notes is not None:
            update_fields["notes"] = update_data.notes
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="Güncellenecek veri bulunamadı")
        
        # Update package product
        result = await db.package_products.update_one(
            {"id": package_product_id, "package_id": package_id},
            {"$set": update_fields}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Paket ürünü bulunamadı")
        
        # Get updated product info for response
        updated_product = await db.package_products.find_one({"id": package_product_id})
        original_product = await db.products.find_one({"id": updated_product["product_id"]})
        
        message_parts = []
        if update_data.quantity is not None:
            message_parts.append(f"miktar: {update_data.quantity}")
        if update_data.custom_price is not None:
            message_parts.append(f"özel fiyat: ₺{update_data.custom_price}")
        elif hasattr(update_data, 'custom_price') and update_data.custom_price is None:
            message_parts.append("özel fiyat kaldırıldı (orijinal fiyat kullanılacak)")
        if update_data.notes is not None:
            if update_data.notes.strip():
                message_parts.append(f"not eklendi: '{update_data.notes[:30]}{'...' if len(update_data.notes) > 30 else ''}'")
            else:
                message_parts.append("not kaldırıldı")
        
        return {
            "success": True,
            "message": f"'{original_product.get('name', 'Ürün')}' güncellendi: {', '.join(message_parts)}",
            "updated_fields": update_fields
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating package product: {e}")
        raise HTTPException(status_code=500, detail="Paket ürünü güncellenemedi")

@api_router.get("/products/favorites")
async def get_favorite_products():
    """Get all favorite products"""
    try:
        products = await db.products.find({"is_favorite": True}).sort("name", 1).to_list(None)
        return [Product(**product) for product in products]
    except Exception as e:
        logger.error(f"Error getting favorite products: {e}")
        raise HTTPException(status_code=500, detail="Favori ürünler getirilemedi")

async def _save_products_smart(company, products_data, user_selected_currency, discount_percentage, filename):
    """Ayristirilan/AI ile cikarilan urunleri akilli guncelleme ile DB'ye kaydet.
    Mevcut urun varsa gunceller, yoksa olusturur; fiyat degisikliklerini izler;
    upload_history kaydi olusturur ve ozet doner."""
    company_id = company['id']
    try:
        # Get current exchange rates
        await currency_service.get_exchange_rates()
        
        # Initialize counters and tracking
        new_products = 0
        updated_products = 0
        price_changes = []
        currency_distribution = {}
        created_products = []
        
        # Get existing products for this company for comparison
        existing_products_cursor = db.products.find({"company_id": company_id})
        existing_products = {product['name']: product async for product in existing_products_cursor}
        
        # Process and save products with smart update
        for product_data in products_data:
            try:
                # Handle company management for color-based parsing
                target_company_id = company_id
                target_company_name = company['name']
                
                # If product has a different company name (from color-based parsing)
                if (product_data.get('company_name') and 
                    product_data['company_name'] != company['name'] and
                    product_data['company_name'] != "Unknown"):
                    
                    # Check if this company already exists
                    existing_company = await db.companies.find_one({"name": product_data['company_name']})
                    if existing_company:
                        target_company_id = existing_company['id']
                        target_company_name = existing_company['name']
                    else:
                        # Create new company
                        new_company_dict = {
                            "id": str(uuid.uuid4()),
                            "name": product_data['company_name'],
                            "created_at": datetime.now(timezone.utc)
                        }
                        await db.companies.insert_one(new_company_dict)
                        target_company_id = new_company_dict['id']
                        target_company_name = new_company_dict['name']
                        logger.info(f"Created new company: {product_data['company_name']}")
                
                # Use user-selected currency if provided, otherwise use detected currency
                final_currency = user_selected_currency if user_selected_currency else product_data.get('currency', 'USD')
                
                # Apply discount if specified
                original_list_price = Decimal(str(product_data['list_price']))
                list_price = original_list_price  # Liste fiyatı orijinal fiyat olarak kalır
                
                # Calculate discounted price based on user discount percentage
                discounted_price = None
                if discount_percentage > 0:
                    # İskonto yüzdesi varsa, orijinal fiyattan indirim yap
                    discount_amount = original_list_price * (Decimal(str(discount_percentage)) / Decimal('100'))
                    discounted_price = original_list_price - discount_amount
                    logger.info(f"Applied {discount_percentage}% discount: {original_list_price} -> {discounted_price}")
                elif product_data.get('discounted_price'):
                    # Excel'de zaten indirimli fiyat varsa onu kullan
                    discounted_price = Decimal(str(product_data['discounted_price']))
                
                # Convert prices to TRY
                list_price_try = await currency_service.convert_to_try(list_price, final_currency)
                
                discounted_price_try = None
                if discounted_price:
                    discounted_price_try = await currency_service.convert_to_try(discounted_price, final_currency)
                
                # Count currency distribution (use final currency)
                currency = final_currency
                currency_distribution[currency] = currency_distribution.get(currency, 0) + 1
                
                # Check if product already exists (by name and company)
                product_name = product_data['name']
                if product_name in existing_products:
                    # Product exists - update it
                    existing_product = existing_products[product_name]
                    old_list_price = float(existing_product.get('list_price', 0))
                    new_list_price = float(product_data['list_price'])
                    
                    # Calculate price change
                    new_list_price = float(list_price)
                    if old_list_price != new_list_price:
                        price_change_amount = new_list_price - old_list_price
                        price_change_percent = ((new_list_price - old_list_price) / old_list_price * 100) if old_list_price > 0 else 0
                        
                        price_changes.append({
                            "product_name": product_name,
                            "old_price": old_list_price,
                            "new_price": new_list_price,
                            "change_amount": price_change_amount,
                            "change_percent": round(price_change_percent, 2),
                            "currency": currency,
                            "change_type": "increase" if price_change_amount > 0 else "decrease"
                        })
                    
                    # Update existing product
                    update_data = {
                        "brand": product_data.get('brand', ''),  # Marka güncellemesi
                        "list_price": float(list_price),
                        "discounted_price": float(discounted_price) if discounted_price else None,
                        "currency": final_currency,
                        "list_price_try": float(list_price_try),
                        "discounted_price_try": float(discounted_price_try) if discounted_price_try else None,
                        "updated_at": datetime.now(timezone.utc)
                    }
                    
                    await db.products.update_one(
                        {"id": existing_product['id']},
                        {"$set": update_data}
                    )
                    updated_products += 1
                    
                else:
                    # New product - create it
                    product_dict = {
                        "id": str(uuid.uuid4()),
                        "name": product_data['name'],
                        "company_id": target_company_id,
                        "brand": product_data.get('brand', ''),  # Marka alanı
                        "description": product_data.get('description'),
                        "image_url": None,
                        "list_price": float(list_price),
                        "discounted_price": float(discounted_price) if discounted_price else None,
                        "currency": final_currency,
                        "list_price_try": float(list_price_try),
                        "discounted_price_try": float(discounted_price_try) if discounted_price_try else None,
                        "created_at": datetime.now(timezone.utc)
                    }
                    
                    await db.products.insert_one(product_dict)
                    created_products.append(Product(**product_dict))
                    new_products += 1
                
            except Exception as e:
                logger.warning(f"Error processing product {product_data.get('name', 'Unknown')}: {e}")
                continue
        
        # Create upload history record
        upload_history = {
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "company_name": company['name'],
            "filename": filename,
            "upload_date": datetime.now(timezone.utc),
            "total_products": len(products_data),
            "new_products": new_products,
            "updated_products": updated_products,
            "currency_distribution": currency_distribution,
            "price_changes": price_changes,
            "status": "completed"
        }
        
        await db.upload_history.insert_one(upload_history)
        
        # Create detailed response message
        messages = []
        if new_products > 0:
            messages.append(f"{new_products} yeni ürün eklendi")
        if updated_products > 0:
            messages.append(f"{updated_products} ürün güncellendi")
        if price_changes:
            price_increases = len([c for c in price_changes if c['change_type'] == 'increase'])
            price_decreases = len([c for c in price_changes if c['change_type'] == 'decrease'])
            if price_increases > 0:
                messages.append(f"{price_increases} ürünün fiyatı zamlandı")
            if price_decreases > 0:
                messages.append(f"{price_decreases} ürünün fiyatı ucuzladı")
        
        message = ". ".join(messages) if messages else "Liste başarıyla yüklendi"
        
        return {
            "success": True,
            "message": message,
            "upload_id": upload_history["id"],
            "summary": {
                "total_products": len(products_data),
                "new_products": new_products,
                "updated_products": updated_products,
                "price_changes": len(price_changes),
                "currency_distribution": currency_distribution
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving products: {e}")
        raise HTTPException(status_code=500, detail="Ürünler kaydedilirken hata oluştu")


class AIConfirmRequest(BaseModel):
    products: List[Dict[str, Any]]
    currency: Optional[str] = None
    discount: Optional[str] = "0"
    filename: Optional[str] = "AI-import"


@api_router.post("/companies/{company_id}/ai-extract-products")
async def ai_extract_products(company_id: str, file: UploadFile = File(...)):
    """PDF / Excel / Görsel yükle -> GPT-4o mini ile ürünleri çıkar.
    KAYDETMEZ; kullanıcının kontrol edip onaylaması için önizleme listesi döner."""
    company = await db.companies.find_one({"id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Firma bulunamadı")

    filename = file.filename or "dosya"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    content_type = (file.content_type or "").lower()

    allowed_ext = {"pdf", "xlsx", "xls", "png", "jpg", "jpeg", "webp"}
    if ext not in allowed_ext and not (content_type.startswith("image/") or content_type == "application/pdf"):
        raise HTTPException(status_code=400, detail="Sadece PDF, Excel (.xlsx/.xls) veya görsel dosyaları kabul edilir.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Boş dosya.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Dosya çok büyük (en fazla {MAX_UPLOAD_BYTES // (1024*1024)} MB).")

    # AI cagrisi senkron -> thread havuzunda calistir (event loop bloke olmasin)
    loop = asyncio.get_event_loop()
    products = await loop.run_in_executor(None, _extract_products_from_file, data, filename, ext, content_type)

    if not products:
        raise HTTPException(status_code=422, detail="Dosyadan ürün çıkarılamadı. Dosyanın net bir fiyat listesi içerdiğinden emin olun.")

    return {"success": True, "count": len(products), "products": products, "filename": filename}


@api_router.post("/companies/{company_id}/ai-confirm-products")
async def ai_confirm_products(company_id: str, payload: AIConfirmRequest):
    """Önizlemede kullanıcının onayladığı (ve düzenlediği) ürünleri akıllı güncelleme ile kaydet."""
    company = await db.companies.find_one({"id": company_id})
    if not company:
        raise HTTPException(status_code=404, detail="Firma bulunamadı")
    if not payload.products:
        raise HTTPException(status_code=400, detail="Kaydedilecek ürün yok.")

    # Para birimi override
    user_selected_currency = None
    if payload.currency and payload.currency.upper() in ['USD', 'EUR', 'TRY']:
        user_selected_currency = payload.currency.upper()

    # Iskonto
    discount_percentage = 0.0
    try:
        if payload.discount and str(payload.discount).strip():
            discount_percentage = float(payload.discount)
            if discount_percentage < 0 or discount_percentage > 100:
                raise ValueError()
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Geçersiz iskonto değeri (0-100 olmalı).")

    # Onizleme urunlerini _save_products_smart'in bekledigi forma normalize et
    products_data = []
    for p in payload.products:
        name = (p.get('name') or '').strip()
        if not name:
            continue
        try:
            list_price = float(p.get('list_price') or 0)
        except (ValueError, TypeError):
            continue
        if list_price <= 0:
            continue
        dp = p.get('discounted_price')
        try:
            discounted_price = float(dp) if dp not in (None, '', 0, '0') else None
        except (ValueError, TypeError):
            discounted_price = None
        products_data.append({
            'name': name,
            'brand': (p.get('brand') or '').strip(),
            'description': p.get('description') or None,
            'list_price': list_price,
            'discounted_price': discounted_price,
            'currency': (p.get('currency') or 'USD'),
        })

    if not products_data:
        raise HTTPException(status_code=400, detail="Geçerli ürün bulunamadı (her ürün için isim ve 0'dan büyük fiyat gerekli).")

    return await _save_products_smart(
        company, products_data, user_selected_currency, discount_percentage, payload.filename or "AI-import"
    )


@api_router.get("/products/count")
async def get_products_count(
    company_id: Optional[str] = None,
    category_id: Optional[str] = None,
    search: Optional[str] = None
):
    """Get optimized total count of products with optional filters"""
    try:
        query = {}
        if company_id:
            query["company_id"] = company_id
        if category_id:
            query["category_id"] = category_id
        if search:
            # Enhanced text search with index utilization (same as main endpoint)
            search_term = search.strip()
            if len(search_term) >= 2:  # Only search for 2+ characters for performance
                query["$text"] = {"$search": search_term}
            else:
                # Fallback for short searches
                query["$or"] = [
                    {"name": {"$regex": f"^{search}", "$options": "i"}},
                    {"brand": {"$regex": f"^{search}", "$options": "i"}}
                ]
            
        # Use estimated count for better performance on large collections
        if not query:  # If no filters, use fast count
            count = await db.products.estimated_document_count()
        else:
            count = await db.products.count_documents(query)
            
        return {"count": count}
    except Exception as e:
        logger.error(f"Error getting products count: {e}")
        # Fallback to basic count
        try:
            basic_query = {}
            if company_id:
                basic_query["company_id"] = company_id
            if category_id:
                basic_query["category_id"] = category_id
            count = await db.products.count_documents(basic_query)
            return {"count": count}
        except Exception as fallback_error:
            logger.error(f"Fallback count query failed: {fallback_error}")
            raise HTTPException(status_code=500, detail="Ürün sayısı getirilemedi")

@api_router.get("/products", response_model=List[Product])
async def get_products(
    company_id: Optional[str] = None,
    category_id: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 100,
    skip_pagination: bool = False,  # For backward compatibility
    request: Request = None
):
    """Get products with optimized pagination, filtering by company, category, or search term"""
    try:
        query = {}
        if company_id:
            query["company_id"] = company_id
        if category_id:
            query["category_id"] = category_id
        if search:
            # Simple and accurate search implementation
            search_term = search.strip()
            if len(search_term) >= 1:
                
                # Turkish character mapping for better search
                def normalize_turkish(text):
                    """Normalize Turkish characters for search"""
                    replacements = {
                        'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
                        'Ç': 'C', 'Ğ': 'G', 'I': 'I', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U'
                    }
                    for tr, en in replacements.items():
                        text = text.replace(tr, en)
                    return text
                
                # Prepare search patterns
                normalized_search = normalize_turkish(search_term)
                
                # Create comprehensive but precise search
                query["$or"] = [
                    # 1. Exact search in name (case insensitive)
                    {"name": {"$regex": search_term, "$options": "i"}},
                    
                    # 2. Normalized search (Turkish chars → English)
                    {"name": {"$regex": normalized_search, "$options": "i"}},
                    
                    # 3. Search in description
                    {"description": {"$regex": search_term, "$options": "i"}},
                    
                    # 4. Search in brand
                    {"brand": {"$regex": search_term, "$options": "i"}},
                    
                    # 5. Normalized search in description
                    {"description": {"$regex": normalized_search, "$options": "i"}},
                    
                    # 6. Normalized search in brand  
                    {"brand": {"$regex": normalized_search, "$options": "i"}}
                ]
        
        # FAVORI ÜRÜNLER ÖNCELİKLİ SIRALAMA: Aggregate ile güçlü sıralama
        pipeline = []
        
        # Match stage - filtering
        if query:
            pipeline.append({"$match": query})
        
        # Sort stage - FAVORİLER ÖNCE! 
        pipeline.append({
            "$sort": {
                "is_favorite": -1,  # True (-1) önce, False (0) sonra
                "name": 1           # Sonra alfabetik
            }
        })
        
        # Pagination
        if not skip_pagination:
            skip = (page - 1) * limit
            pipeline.extend([
                {"$skip": skip},
                {"$limit": limit}
            ])
        else:
            pipeline.append({"$limit": 5000})  # Max limit
        
        # Execute aggregation pipeline
        cursor = db.products.aggregate(pipeline)
        products = await cursor.to_list(None)
        
        # Convert Decimal fields to float for JSON serialization
        response_data = []
        for product in products:
            # Convert Decimal fields to float
            if 'list_price' in product and isinstance(product['list_price'], Decimal):
                product['list_price'] = float(product['list_price'])
            if 'discounted_price' in product and isinstance(product['discounted_price'], Decimal):
                product['discounted_price'] = float(product['discounted_price'])
            if 'list_price_try' in product and isinstance(product['list_price_try'], Decimal):
                product['list_price_try'] = float(product['list_price_try'])
            if 'discounted_price_try' in product and isinstance(product['discounted_price_try'], Decimal):
                product['discounted_price_try'] = float(product['discounted_price_try'])
            
            response_data.append(product)
        
        # PERFORMANCE: Cache invalidation for products to ensure fresh sorting
        if not search:
            response = JSONResponse(content=response_data)
            response.headers["Cache-Control"] = "public, max-age=60"  # Kısa cache favori sıralama için
        else:
            response = JSONResponse(content=response_data)
            response.headers["Cache-Control"] = "public, max-age=30"  # Arama için daha kısa
            
        return response
            
    except Exception as e:
        logger.error(f"Error getting products: {e}")
        # Fallback to basic query if optimization fails
        try:
            basic_query = {}
            if company_id:
                basic_query["company_id"] = company_id
            if category_id:
                basic_query["category_id"] = category_id
            
            # CRITICAL FIX: Add search logic to fallback query
            if search:
                search_term = search.strip()
                if len(search_term) >= 1:
                    # Turkish character mapping for fallback search
                    def normalize_turkish(text):
                        replacements = {
                            'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
                            'Ç': 'C', 'Ğ': 'G', 'I': 'I', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U'
                        }
                        for tr, en in replacements.items():
                            text = text.replace(tr, en)
                        return text
                    
                    normalized_search = normalize_turkish(search_term)
                    
                    # Same search logic as main query
                    basic_query["$or"] = [
                        {"name": {"$regex": search_term, "$options": "i"}},
                        {"name": {"$regex": normalized_search, "$options": "i"}},
                        {"description": {"$regex": search_term, "$options": "i"}},
                        {"brand": {"$regex": search_term, "$options": "i"}},
                        {"description": {"$regex": normalized_search, "$options": "i"}},
                        {"brand": {"$regex": normalized_search, "$options": "i"}}
                    ]
            
            skip = (page - 1) * limit if not skip_pagination else 0
            # IMPORTANT: Use the same sorting as aggregate pipeline - FAVORITES FIRST!
            query_limit = 5000 if skip_pagination else limit
            products = await db.products.find(basic_query).sort([("is_favorite", -1), ("name", 1)]).skip(skip).limit(query_limit).to_list(query_limit)
            
            # Convert Decimal fields to float for JSON serialization
            response_data = []
            for product in products:
                # Convert Decimal fields to float
                if 'list_price' in product and isinstance(product['list_price'], Decimal):
                    product['list_price'] = float(product['list_price'])
                if 'discounted_price' in product and isinstance(product['discounted_price'], Decimal):
                    product['discounted_price'] = float(product['discounted_price'])
                if 'list_price_try' in product and isinstance(product['list_price_try'], Decimal):
                    product['list_price_try'] = float(product['list_price_try'])
                if 'discounted_price_try' in product and isinstance(product['discounted_price_try'], Decimal):
                    product['discounted_price_try'] = float(product['discounted_price_try'])
                
                response_data.append(product)
            
            return response_data
        except Exception as fallback_error:
            logger.error(f"Fallback query also failed: {fallback_error}")
            raise HTTPException(status_code=500, detail="Ürünler getirilemedi")

@api_router.post("/products", response_model=Product)
async def create_product(product: ProductCreate):
    """Create a new product manually"""
    try:
        # Verify company exists
        company = await db.companies.find_one({"id": product.company_id})
        if not company:
            raise HTTPException(status_code=404, detail="Firma bulunamadı")
        
        # Verify category exists if provided
        if product.category_id:
            category = await db.categories.find_one({"id": product.category_id})
            if not category:
                raise HTTPException(status_code=404, detail="Kategori bulunamadı")
        
        # Get exchange rates for TRY conversion
        exchange_rates = await currency_service.get_exchange_rates()
        
        # Create product with currency conversion
        from fastapi.encoders import jsonable_encoder
        
        # Use jsonable_encoder to properly convert Decimal to float
        product_data = jsonable_encoder(product.dict())
        product_data["id"] = str(uuid.uuid4())  
        product_data["created_at"] = datetime.now(timezone.utc)
        
        # Convert prices to TRY
        if product.currency == 'USD':
            product_data["list_price_try"] = float(product.list_price * exchange_rates.get('USD', 1))
            if product.discounted_price:
                product_data["discounted_price_try"] = float(product.discounted_price * exchange_rates.get('USD', 1))
        elif product.currency == 'EUR':
            product_data["list_price_try"] = float(product.list_price * exchange_rates.get('EUR', 1))
            if product.discounted_price:
                product_data["discounted_price_try"] = float(product.discounted_price * exchange_rates.get('EUR', 1))
        else:  # TRY
            product_data["list_price_try"] = float(product.list_price)
            if product.discounted_price:
                product_data["discounted_price_try"] = float(product.discounted_price)
        
        # Insert into database
        await db.products.insert_one(product_data)
        
        # PERFORMANCE: Invalidate cache
        invalidate_cache("/api/products")
        
        return Product(**product_data)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating product: {e}")
        raise HTTPException(status_code=500, detail="Ürün oluşturulamadı")


@api_router.post("/refresh-prices")
async def refresh_prices():
    """Refresh all product prices with current exchange rates"""
    try:
        # Get fresh exchange rates
        await currency_service.get_exchange_rates()
        
        # Get all products
        products = await db.products.find().to_list(None)
        updated_count = 0
        
        for product in products:
            try:
                if product['currency'] != 'TRY':
                    # Convert prices to TRY
                    list_price_try = await currency_service.convert_to_try(
                        Decimal(str(product['list_price'])), 
                        product['currency']
                    )
                    
                    discounted_price_try = None
                    if product.get('discounted_price'):
                        discounted_price_try = await currency_service.convert_to_try(
                            Decimal(str(product['discounted_price'])), 
                            product['currency']
                        )
                    
                    # Update product
                    await db.products.update_one(
                        {"id": product["id"]},
                        {
                            "$set": {
                                "list_price_try": float(list_price_try),
                                "discounted_price_try": float(discounted_price_try) if discounted_price_try else None
                            }
                        }
                    )
                    updated_count += 1
                    
            except Exception as e:
                logger.warning(f"Error updating product {product.get('name', 'Unknown')}: {e}")
                continue
        
        return {
            "success": True,
            "message": f"{updated_count} ürünün fiyatı güncellendi",
            "updated_count": updated_count
        }
        
    except Exception as e:
        logger.error(f"Error refreshing prices: {e}")
        raise HTTPException(status_code=500, detail="Fiyatlar güncellenemedi")

# Upload History Endpoints
@api_router.get("/companies/{company_id}/upload-history", response_model=List[UploadHistoryResponse])
async def get_company_upload_history(company_id: str):
    """Get upload history for a specific company"""
    try:
        # Verify company exists
        company = await db.companies.find_one({"id": company_id})
        if not company:
            raise HTTPException(status_code=404, detail="Firma bulunamadı")
        
        # Get upload history for this company, sorted by date (newest first)
        upload_history = await db.upload_history.find(
            {"company_id": company_id}
        ).sort("upload_date", -1).to_list(None)
        
        return [UploadHistoryResponse(**history) for history in upload_history]
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting upload history: {e}")
        raise HTTPException(status_code=500, detail="Upload geçmişi getirilemedi")

@api_router.get("/upload-history/{upload_id}", response_model=UploadHistoryResponse)
async def get_upload_details(upload_id: str):
    """Get detailed information about a specific upload"""
    try:
        upload = await db.upload_history.find_one({"id": upload_id})
        if not upload:
            raise HTTPException(status_code=404, detail="Upload bulunamadı")
        
        return UploadHistoryResponse(**upload)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting upload details: {e}")
        raise HTTPException(status_code=500, detail="Upload detayları getirilemedi")

@api_router.get("/upload-history", response_model=List[UploadHistoryResponse])
async def get_all_upload_history():
    """Get all upload history across all companies"""
    try:
        upload_history = await db.upload_history.find().sort("upload_date", -1).to_list(None)
        return [UploadHistoryResponse(**history) for history in upload_history]
        
    except Exception as e:
        logger.error(f"Error getting all upload history: {e}")
        raise HTTPException(status_code=500, detail="Upload geçmişi getirilemedi")

@api_router.post("/upload-history/{upload_id}/change-currency")
async def change_upload_currency(upload_id: str, new_currency: str):
    """Change currency for all products in a specific upload"""
    try:
        # Validate currency
        valid_currencies = ['USD', 'EUR', 'TRY', 'GBP']
        if new_currency not in valid_currencies:
            raise HTTPException(status_code=400, detail=f"Geçersiz para birimi. Geçerli seçenekler: {', '.join(valid_currencies)}")
        
        # Get upload history
        upload = await db.upload_history.find_one({"id": upload_id})
        if not upload:
            raise HTTPException(status_code=404, detail="Upload bulunamadı")
        
        # Get current exchange rates
        await currency_service.get_exchange_rates()
        
        # Find all products uploaded in this batch
        # We'll identify products by upload date range (within 5 minutes of upload)
        upload_date = upload['upload_date']
        start_time = upload_date - timedelta(minutes=5)
        end_time = upload_date + timedelta(minutes=5)
        
        # Get products from this company within the time range
        company_id = upload['company_id']
        products_cursor = db.products.find({
            "company_id": company_id,
            "created_at": {"$gte": start_time, "$lte": end_time}
        })
        products = await products_cursor.to_list(None)
        
        if not products:
            # Alternative method: get products by estimated count
            # This is less precise but more reliable
            company_products_cursor = db.products.find({"company_id": company_id}).sort("created_at", -1)
            all_company_products = await company_products_cursor.to_list(None)
            
            # Take approximately the number of products that were in the upload
            expected_count = upload.get('total_products', 0)
            if expected_count > 0 and len(all_company_products) >= expected_count:
                products = all_company_products[:expected_count]
            else:
                raise HTTPException(status_code=404, detail="Bu upload'a ait ürünler bulunamadı")
        
        updated_count = 0
        price_changes = []
        
        # Update each product's currency (PRESERVE PRICE VALUES, ONLY CHANGE CURRENCY LABEL)
        for product in products:
            try:
                old_currency = product.get('currency', 'TRY')
                old_list_price = product.get('list_price', 0)
                old_discounted_price = product.get('discounted_price')
                
                # Skip if already in target currency
                if old_currency == new_currency:
                    continue
                
                ## IMPORTANT: Keep the same price values, only change currency label
                ## This is for cases where Excel had correct prices but wrong currency was detected
                
                # Keep the same numeric values, just change the currency
                new_list_price = old_list_price  # Same value!
                new_discounted_price = old_discounted_price  # Same value!
                
                # Recalculate TRY prices based on new currency (for internal calculations)
                new_list_price_try = await currency_service.convert_to_try(
                    Decimal(str(new_list_price)), new_currency
                )
                
                new_discounted_price_try = None
                if new_discounted_price:
                    new_discounted_price_try = await currency_service.convert_to_try(
                        Decimal(str(new_discounted_price)), new_currency
                    )
                
                # Update product in database
                update_data = {
                    "currency": new_currency,
                    "list_price": float(new_list_price),  # Same numeric value
                    "list_price_try": float(new_list_price_try),  # Recalculated for TRY
                    "updated_at": datetime.now(timezone.utc)
                }
                
                if new_discounted_price:
                    update_data["discounted_price"] = float(new_discounted_price)  # Same numeric value
                    update_data["discounted_price_try"] = float(new_discounted_price_try)  # Recalculated for TRY

                # NOTE: the DB update must run for EVERY product, not only the ones that
                # happen to have a discounted price. Previously these lines were nested
                # under "if new_discounted_price:", so products without a discount were
                # never written back - their currency/TL price silently stayed stale.
                await db.products.update_one(
                    {"id": product['id']},
                    {"$set": update_data}
                )

                updated_count += 1

                # Track currency change (prices stay the same, only currency label changes)
                price_changes.append({
                    "product_name": product['name'],
                    "old_currency": old_currency,
                    "new_currency": new_currency,
                    "price_value": float(old_list_price),  # Same value in both currencies
                    "change_type": "currency_label_only"
                })

            except Exception as e:
                logger.warning(f"Error updating product {product.get('name', 'Unknown')}: {e}")
                continue
        
        # Update upload history to reflect the currency change
        await db.upload_history.update_one(
            {"id": upload_id},
            {
                "$set": {
                    "currency_changes": price_changes,
                    "last_currency_update": datetime.now(timezone.utc)
                }
            }
        )

        # Invalidate cached product lists so the updated currency/TL prices are served
        # immediately instead of stale cached values.
        invalidate_cache()

        return {
            "success": True,
            "message": f"{updated_count} ürünün para birimi {new_currency} olarak güncellendi (fiyat değerleri aynı kaldı)",
            "updated_count": updated_count,
            "currency_changes": price_changes[:10]  # Show first 10 changes
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error changing upload currency: {e}")
        raise HTTPException(status_code=500, detail=f"Para birimi güncellenemedi: {str(e)}")

# ===========================
# EXCEL EXPORT & TEMPLATE ENDPOINTS
# ===========================

@api_router.get("/products/export/template")
async def download_product_template():
    """Download Excel template for product import"""
    try:
        # Create workbook and worksheet
        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.title = "Ürünler"
        
        # Define headers
        headers = [
            "Ürün Adı*",
            "Marka",
            "Açıklama",
            "Liste Fiyatı*",
            "İndirimli Fiyat",
            "Para Birimi* (USD/EUR/TRY/GBP)",
            "Görsel URL",
            "Stok Miktarı"
        ]
        
        # Style header row
        header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
        for col_num, header in enumerate(headers, 1):
            cell = sheet.cell(row=1, column=col_num)
            cell.value = header
            cell.fill = header_fill
            cell.font = openpyxl.styles.Font(bold=True, color="FFFFFF")
        
        # Add example row
        example_data = [
            "Güneş Paneli 100W",
            "Apex",
            "Monokristal güneş paneli",
            "150.00",
            "120.00",
            "USD",
            "https://example.com/panel.jpg",
            "10"
        ]
        for col_num, value in enumerate(example_data, 1):
            sheet.cell(row=2, column=col_num).value = value
        
        # Adjust column widths
        for col_num in range(1, len(headers) + 1):
            sheet.column_dimensions[openpyxl.utils.get_column_letter(col_num)].width = 20
        
        # Save to BytesIO
        output = BytesIO()
        workbook.save(output)
        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=urun_sablonu.xlsx"}
        )
        
    except Exception as e:
        logger.error(f"Error creating template: {e}")
        raise HTTPException(status_code=500, detail="Şablon oluşturulamadı")

@api_router.get("/products/export")
async def export_products(
    company_id: Optional[str] = None,
    category_id: Optional[str] = None
):
    """Export products to Excel file"""
    try:
        # Build query
        query = {}
        if company_id:
            query["company_id"] = company_id
        if category_id:
            query["category_id"] = category_id
        
        # Get products
        products = await db.products.find(query).to_list(None)
        
        if not products:
            raise HTTPException(status_code=404, detail="Dışa aktarılacak ürün bulunamadı")
        
        # Get companies and categories for lookup
        companies = {c["id"]: c["name"] for c in await db.companies.find().to_list(None)}
        categories = {c["id"]: c["name"] for c in await db.categories.find().to_list(None)}
        
        # Create workbook
        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.title = "Ürünler"
        
        # Headers
        headers = [
            "Ürün Adı",
            "Firma",
            "Kategori",
            "Marka",
            "Açıklama",
            "Liste Fiyatı",
            "İndirimli Fiyat",
            "Para Birimi",
            "Liste Fiyatı (TL)",
            "İndirimli Fiyat (TL)",
            "Favori",
            "Stok",
            "Görsel URL",
            "Oluşturulma Tarihi"
        ]
        
        # Style header
        header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
        for col_num, header in enumerate(headers, 1):
            cell = sheet.cell(row=1, column=col_num)
            cell.value = header
            cell.fill = header_fill
            cell.font = openpyxl.styles.Font(bold=True, color="FFFFFF")
        
        # Add product data
        for row_num, product in enumerate(products, 2):
            sheet.cell(row=row_num, column=1).value = product.get("name", "")
            sheet.cell(row=row_num, column=2).value = companies.get(product.get("company_id", ""), "")
            sheet.cell(row=row_num, column=3).value = categories.get(product.get("category_id", ""), "")
            sheet.cell(row=row_num, column=4).value = product.get("brand", "")
            sheet.cell(row=row_num, column=5).value = product.get("description", "")
            sheet.cell(row=row_num, column=6).value = float(product.get("list_price", 0))
            sheet.cell(row=row_num, column=7).value = float(product.get("discounted_price", 0)) if product.get("discounted_price") else ""
            sheet.cell(row=row_num, column=8).value = product.get("currency", "")
            sheet.cell(row=row_num, column=9).value = float(product.get("list_price_try", 0)) if product.get("list_price_try") else ""
            sheet.cell(row=row_num, column=10).value = float(product.get("discounted_price_try", 0)) if product.get("discounted_price_try") else ""
            sheet.cell(row=row_num, column=11).value = "Evet" if product.get("is_favorite") else "Hayır"
            sheet.cell(row=row_num, column=12).value = product.get("stock_quantity", "")
            sheet.cell(row=row_num, column=13).value = product.get("image_url", "")
            sheet.cell(row=row_num, column=14).value = product.get("created_at", "").strftime("%d.%m.%Y %H:%M") if product.get("created_at") else ""
        
        # Adjust column widths
        for col_num in range(1, len(headers) + 1):
            sheet.column_dimensions[openpyxl.utils.get_column_letter(col_num)].width = 15
        
        # Save to BytesIO
        output = BytesIO()
        workbook.save(output)
        output.seek(0)
        
        filename = f"urunler_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting products: {e}")
        raise HTTPException(status_code=500, detail="Ürünler dışa aktarılamadı")

# Bulk Operations Models
class BulkUpdatePriceRequest(BaseModel):
    product_ids: List[str]
    price_change_type: str  # "percentage" or "fixed"
    price_change_value: float
    apply_to: str = "list_price"  # "list_price" or "discounted_price"

class BulkUpdateCategoryRequest(BaseModel):
    product_ids: List[str]
    category_id: str

@api_router.post("/products/bulk-update-price")
async def bulk_update_price(request: BulkUpdatePriceRequest):
    """Bulk update product prices"""
    try:
        if not request.product_ids:
            raise HTTPException(status_code=400, detail="Ürün seçilmedi")
        
        updated_count = 0
        
        for product_id in request.product_ids:
            product = await db.products.find_one({"id": product_id})
            if not product:
                continue
            
            update_data = {}
            
            # Get current price
            current_price = float(product.get(request.apply_to, 0))
            
            # Calculate new price
            if request.price_change_type == "percentage":
                new_price = current_price * (1 + request.price_change_value / 100)
            else:  # fixed
                new_price = current_price + request.price_change_value
            
            # Ensure positive price
            new_price = max(0, new_price)
            
            # Update price
            update_data[request.apply_to] = new_price
            
            # Recalculate TRY prices
            currency = product.get("currency", "USD")
            rates = await currency_service.get_exchange_rates()
            
            if request.apply_to == "list_price":
                update_data["list_price_try"] = await currency_service.convert_to_try(new_price, currency)
            else:
                update_data["discounted_price_try"] = await currency_service.convert_to_try(new_price, currency)
            
            await db.products.update_one(
                {"id": product_id},
                {"$set": update_data}
            )
            
            updated_count += 1
        
        return {
            "success": True,
            "message": f"{updated_count} ürünün fiyatı güncellendi",
            "updated_count": updated_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error bulk updating prices: {e}")
        raise HTTPException(status_code=500, detail="Fiyatlar toplu güncellenemedi")

@api_router.post("/products/bulk-update-category")
async def bulk_update_category(request: BulkUpdateCategoryRequest):
    """Bulk update product category"""
    try:
        if not request.product_ids:
            raise HTTPException(status_code=400, detail="Ürün seçilmedi")
        
        # Verify category exists
        if request.category_id:
            category = await db.categories.find_one({"id": request.category_id})
            if not category:
                raise HTTPException(status_code=404, detail="Kategori bulunamadı")
        
        # Update products
        result = await db.products.update_many(
            {"id": {"$in": request.product_ids}},
            {"$set": {"category_id": request.category_id if request.category_id else None}}
        )
        
        return {
            "success": True,
            "message": f"{result.modified_count} ürünün kategorisi güncellendi",
            "updated_count": result.modified_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error bulk updating category: {e}")
        raise HTTPException(status_code=500, detail="Kategoriler toplu güncellenemedi")

# Category Groups CRUD Operations
@api_router.get("/category-groups")
async def get_category_groups():
    """Get all category groups sorted by sort_order, then by name"""
    try:
        groups = []
        # Kategorileri önce sort_order'a, sonra name'e göre sırala
        async for group in db.category_groups.find().sort([("sort_order", 1), ("name", 1)]):
            # Remove MongoDB _id field
            group.pop('_id', None)
            groups.append(group)
        return groups
    except Exception as e:
        logger.error(f"Error fetching category groups: {e}")
        raise HTTPException(status_code=500, detail="Kategori grupları getirilemedi")

@api_router.post("/category-groups")
async def create_category_group(group_data: CategoryGroupCreate):
    """Create a new category group"""
    try:
        group = {
            "id": str(uuid.uuid4()),
            "name": group_data.name,
            "description": group_data.description,
            "color": group_data.color or "#6B7280",
            "category_ids": group_data.category_ids,
            "created_at": datetime.now(timezone.utc)
        }
        
        result = await db.category_groups.insert_one(group)
        # Remove MongoDB _id field for response
        group.pop('_id', None)
        return {"success": True, "message": "Kategori grubu oluşturuldu", "group": group}
    except Exception as e:
        logger.error(f"Error creating category group: {e}")
        raise HTTPException(status_code=500, detail="Kategori grubu oluşturulamadı")

@api_router.put("/category-groups/{group_id}")
async def update_category_group(group_id: str, group_data: CategoryGroupUpdate):
    """Update a category group"""
    try:
        update_dict = {}
        if group_data.name is not None:
            update_dict["name"] = group_data.name
        if group_data.description is not None:
            update_dict["description"] = group_data.description
        if group_data.color is not None:
            update_dict["color"] = group_data.color
        if group_data.category_ids is not None:
            update_dict["category_ids"] = group_data.category_ids
        if group_data.sort_order is not None:
            update_dict["sort_order"] = group_data.sort_order
            
        if not update_dict:
            raise HTTPException(status_code=400, detail="Güncellenecek alan belirtilmedi")
            
        result = await db.category_groups.update_one(
            {"id": group_id},
            {"$set": update_dict}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Kategori grubu bulunamadı")
            
        return {"success": True, "message": "Kategori grubu güncellendi"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating category group: {e}")
        raise HTTPException(status_code=500, detail="Kategori grubu güncellenemedi")

@api_router.delete("/category-groups/{group_id}")
async def delete_category_group(group_id: str):
    """Delete a category group"""
    try:
        result = await db.category_groups.delete_one({"id": group_id})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Kategori grubu bulunamadı")
            
        return {"success": True, "message": "Kategori grubu silindi"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting category group: {e}")
        raise HTTPException(status_code=500, detail="Kategori grubu silinemedi")

@api_router.post("/category-groups/reorder")
async def reorder_category_groups(group_orders: List[Dict[str, Any]]):
    """Kategori gruplarının sırasını toplu güncelle"""
    try:
        # group_orders: [{"id": "group1", "sort_order": 1}, {"id": "group2", "sort_order": 2}, ...]
        for item in group_orders:
            group_id = item.get("id")
            sort_order = item.get("sort_order", 0)
            
            if group_id:
                await db.category_groups.update_one(
                    {"id": group_id},
                    {"$set": {"sort_order": sort_order}}
                )
        
        # Return updated category groups sorted by new order
        groups = []
        async for group in db.category_groups.find().sort([("sort_order", 1), ("name", 1)]):
            group.pop('_id', None)
            groups.append(group)
        
        return {
            "success": True,
            "message": "Kategori grubu sıralaması güncellendi",
            "category_groups": groups
        }
        
    except Exception as e:
        logger.error(f"Error reordering category groups: {e}")
        raise HTTPException(status_code=500, detail="Kategori grubu sıralaması güncellenemedi")

# Static file serving for MongoDB Atlas migration files
@api_router.get("/atlas-downloads")
async def downloads_page():
    """Serve the downloads index page"""
    try:
        with open("/app/downloads/index.html", "r", encoding="utf-8") as f:
            content = f.read()
        return StreamingResponse(
            io.StringIO(content),
            media_type="text/html; charset=utf-8"
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Downloads page not found")

@api_router.get("/atlas-downloads/{filename}")
async def download_file(filename: str):
    """Serve JSON files for download"""
    file_path = f"/app/downloads/{filename}"
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"File {filename} not found")
    
    if not filename.endswith('.json'):
        raise HTTPException(status_code=400, detail="Only JSON files are allowed for download")
    
    return FileResponse(
        file_path,
        media_type="application/json",
        filename=filename,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# Mount static files directory for any other files
try:
    app.mount("/downloads", StaticFiles(directory="/app/downloads"), name="downloads")
except Exception as e:
    logger.warning(f"Could not mount static files: {e}")

# Authentication Endpoints
@api_router.post("/auth/login", response_model=LoginResponse)
async def login(login_request: LoginRequest, response: JSONResponse):
    """User login endpoint"""
    try:
        # Find user in database
        user = await db.users.find_one({"username": login_request.username})
        if not user:
            raise HTTPException(status_code=401, detail="Geçersiz kullanıcı adı veya şifre")
        
        # Verify password
        if not auth_service.verify_password(login_request.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Geçersiz kullanıcı adı veya şifre")
        
        # Check if user is active
        if not user.get("is_active", True):
            raise HTTPException(status_code=401, detail="Hesap devre dışı")
        
        # Create session
        session_token = await auth_service.create_session(login_request.username)
        
        # Set session cookie
        response = JSONResponse(
            content={
                "success": True,
                "message": "Başarıyla giriş yapıldı",
                "session_token": session_token
            }
        )
        response.set_cookie(
            key="session_token",
            value=session_token,
            max_age=86400,  # 24 hours in seconds
            httponly=True,
            secure=False,  # Set True in production with HTTPS
            samesite="lax"
        )
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {e}")
        raise HTTPException(status_code=500, detail="Giriş işlemi sırasında hata oluştu")

@api_router.post("/auth/logout")
async def logout(session_token: Optional[str] = Cookie(None)):
    """User logout endpoint"""
    try:
        if session_token:
            await auth_service.logout(session_token)
        
        response = JSONResponse(content={"success": True, "message": "Başarıyla çıkış yapıldı"})
        response.delete_cookie("session_token")
        return response
        
    except Exception as e:
        logger.error(f"Logout error: {e}")
        response = JSONResponse(content={"success": True, "message": "Çıkış yapıldı"})
        response.delete_cookie("session_token")
        return response

@api_router.get("/auth/check")
async def check_auth(current_user: str = Depends(get_current_user_optional)):
    """Check authentication status"""
    return {
        "authenticated": current_user is not None,
        "username": current_user
    }

# ==================== WEB SCRAPING ====================

class ScrapeRequest(BaseModel):
    url: str
    
class ScrapedProduct(BaseModel):
    name: str
    price: Optional[float] = None
    image_url: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    currency: Optional[str] = "TRY"

@api_router.post("/scrape-products")
async def scrape_products(request: ScrapeRequest):
    """Web sitesinden ürünleri scrape eder"""
    from bs4 import BeautifulSoup
    import re
    
    try:
        logger.info(f"Scraping URL: {request.url}")

        # URL'i fetch et
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        # Senkron requests.get'i executor'a sar -> event loop bloke olmasin (yuk altinda diger istekler donmasin)
        loop = asyncio.get_running_loop()
        response = await loop.run_in_executor(
            None, lambda: requests.get(request.url, headers=headers, timeout=30)
        )
        response.raise_for_status()

        logger.info(f"Sayfa indirildi. Boyut: {len(response.content)} bytes")
        
        # HTML'i parse et
        soup = BeautifulSoup(response.content, 'lxml')
        
        # Ürünleri bul - Yaygın HTML yapıları
        products = []
        
        # Product card'ları bul - birçok farklı site yapısını destekle
        product_containers = []
        
        # Strateji 1: showcase class (solarkutu.com gibi)
        showcase_items = soup.find_all('div', class_=re.compile(r'showcase', re.I))
        if showcase_items:
            product_containers.extend(showcase_items)
            print(f"✅ {len(showcase_items)} showcase item bulundu")
        
        # Strateji 2: product class
        if not product_containers:
            product_items = soup.find_all(['div', 'article', 'li'], class_=re.compile(r'product', re.I))
            if product_items:
                product_containers.extend(product_items)
                print(f"✅ {len(product_items)} product item bulundu")
        
        # Strateji 3: item class
        if not product_containers:
            item_containers = soup.find_all(['div', 'article', 'li'], class_=re.compile(r'item', re.I))
            if item_containers:
                product_containers.extend(item_containers)
                print(f"✅ {len(item_containers)} item container bulundu")
        
        # Strateji 4: data attributes
        if not product_containers:
            data_products = soup.find_all(['div', 'article'], attrs={'data-product-id': True})
            if data_products:
                product_containers.extend(data_products)
                print(f"✅ {len(data_products)} data-product item bulundu")
        
        print(f"📦 Toplam {len(product_containers)} potansiyel ürün container bulundu")
        
        seen_names = set()  # Duplicate kontrolü için
        
        for container in product_containers[:50]:  # İlk 50 ürün
            try:
                # ÖNEMLI: itemCategory element varsa, category bilgisini al ama devam et
                # (agus.com.tr'de itemCategory ve ürün bilgisi aynı container'da)
                has_category_header = container.find('a', class_='itemCategory')
                if has_category_header:
                    category_header_text = has_category_header.get_text(strip=True)
                    # Eğer container SADECE category header içeriyorsa atla
                    # Yoksa category bilgisini not et ve devam et
                
                # Ürün adı - birçok farklı yapıyı dene
                name_elem = (
                    container.find(class_=re.compile(r'showcase-title', re.I)) or  # solarkutu
                    container.find(class_=re.compile(r'productName', re.I)) or  # agus
                    container.find(class_=re.compile(r'product.*title', re.I)) or  # genel
                    container.find(class_=re.compile(r'product.*name', re.I)) or  # genel
                    container.find(['h1', 'h2', 'h3', 'h4'], class_=re.compile(r'(name|title)', re.I)) or
                    container.find('a', title=True)
                )
                name = name_elem.get_text(strip=True) if name_elem else None
                
                # Eğer isim yok veya çok kısa ise atla
                if not name or len(name) < 5:
                    continue
                
                # Duplicate kontrolü
                if name and name in seen_names:
                    print(f"⏭️ Atlanan (duplicate): {name[:50]}...")
                    continue
                
                # Fiyat - birçok farklı yapıyı dene
                price_elem = (
                    container.find(class_=re.compile(r'showcase-price-new', re.I)) or  # solarkutu
                    container.find(class_=re.compile(r'discountPriceSpan', re.I)) or  # agus
                    container.find(class_=re.compile(r'(price|fiyat|amount)', re.I)) or  # genel
                    container.find(['span', 'div', 'p'], attrs={'data-price': True})
                )
                price_text = price_elem.get_text(strip=True) if price_elem else None
                price = None
                if price_text:
                    # Sayıları çıkar - birçok format destekle
                    # Örnekler: ₺3.152,50 / 15.497,45 TL / $1,234.56
                    price_clean = price_text.replace('₺', '').replace('TL', '').replace('$', '').replace('€', '').replace(' ', '')
                    
                    # Türk formatı: 15.497,45 -> 15497.45
                    if ',' in price_clean and '.' in price_clean:
                        # Nokta binlik ayracı, virgül ondalık
                        price_clean = price_clean.replace('.', '').replace(',', '.')
                    elif ',' in price_clean:
                        # Sadece virgül var - ondalık ayracı
                        price_clean = price_clean.replace(',', '.')
                    
                    price_match = re.search(r'([\d.]+)', price_clean)
                    if price_match:
                        try:
                            price = float(price_match.group(1))
                        except (ValueError, TypeError):
                            pass
                
                # Görsel - productImage veya productImageOwlSlider içindeki img'yi bul
                image_url = None
                
                # Tüm img elementlerini bul ve uygun olanı seç
                all_imgs = container.find_all('img')
                
                for img_elem in all_imgs:
                    # data-src öncelikli (lazy loading için), sonra src
                    candidate_url = img_elem.get('data-src') or img_elem.get('src') or img_elem.get('data-lazy-src')
                    
                    # load.gif, placeholder, lazy load indicator'larını atla
                    if candidate_url and not any(skip in candidate_url.lower() for skip in ['load.gif', 'placeholder', 'loading.gif']):
                        # Relative URL'i absolute yap
                        if not candidate_url.startswith('http'):
                            from urllib.parse import urljoin
                            candidate_url = urljoin(request.url, candidate_url)
                        
                        # İlk geçerli görseli kullan
                        if candidate_url.startswith('http'):
                            image_url = candidate_url
                            break
                
                # Kategori - itemCategoryLine'dan al
                category = None
                if has_category_header:
                    category = category_header_text
                else:
                    category_line = container.find('div', class_='itemCategoryLine')
                    if category_line:
                        category = category_line.get_text(strip=True)
                
                # Marka
                brand_elem = container.find(class_=re.compile(r'(productMarka|brand|marka)', re.I))
                brand = brand_elem.get_text(strip=True) if brand_elem else None
                
                # Açıklama
                desc_elem = container.find(class_=re.compile(r'(description|desc|aciklama)', re.I))
                description = desc_elem.get_text(strip=True) if desc_elem else None
                
                # Ürün oluştur
                if name and price:  # İsim VE fiyat zorunlu (kategori başlıklarını filtrele)
                    seen_names.add(name)  # İsmi kaydet
                    product = ScrapedProduct(
                        name=name[:200],  # Max 200 karakter
                        price=price,
                        image_url=image_url,
                        description=description[:500] if description else None,
                        category=category[:100] if category else None,
                        brand=brand[:100] if brand else None,
                        currency="TRY"
                    )
                    products.append(product.dict())
                    print(f"✅ Ürün eklendi: {name[:50]}... - ₺{price} - Görsel: {('Var' if image_url else 'Yok')}")
                elif name and not price:
                    print(f"⏭️ Atlanan (fiyat yok, muhtemelen kategori): {name[:50]}...")
                    
            except Exception as e:
                print(f"⚠️ Ürün parse hatası: {str(e)}")
                continue
        
        print(f"🎉 Toplam {len(products)} ürün başarıyla parse edildi")
        
        return {
            "success": True,
            "url": request.url,
            "products": products,
            "count": len(products)
        }
        
    except requests.RequestException as e:
        print(f"❌ HTTP Hatası: {str(e)}")
        raise HTTPException(status_code=400, detail=f"URL'e erişilemedi: {str(e)}")
    except Exception as e:
        print(f"❌ Scraping Hatası: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Scraping hatası: {str(e)}")

# ============================================================================
# AKÜ TEST ANALİZİ (Gemini AI ile) ENDPOINT'LERİ
# ============================================================================

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GEMINI_MODEL = 'gemini-flash-latest'  # gemini-1.5-flash alias
GEMINI_ENDPOINT = f'https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent'

# OpenAI (GPT-4o mini) - sistemdeki tum yapay zeka islerinin (batarya analizi + urun cikarma) ana modeli
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
OPENAI_MODEL = os.environ.get('OPENAI_MODEL', 'gpt-4o-mini')
OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions'


def _call_openai_chat(messages: list, max_tokens: int = 2048, temperature: float = 0.2, json_mode: bool = False) -> str:
    """OpenAI Chat Completions (GPT-4o mini) cagrisi. messages OpenAI formatinda; metin doner.
    json_mode=True ise response_format JSON nesnesi zorlanir (prompt'ta 'json' gecmeli)."""
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY tanımlı değil (backend/.env).")
    payload = {
        "model": OPENAI_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    try:
        response = requests.post(
            OPENAI_ENDPOINT,
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
            json=payload,
            timeout=120,
        )
    except requests.RequestException as e:
        logger.error(f"OpenAI bağlantı hatası: {e}")
        raise HTTPException(status_code=504, detail="OpenAI API'ye ulaşılamadı.")
    if response.status_code != 200:
        logger.error(f"OpenAI API hatası ({response.status_code}): {response.text[:500]}")
        raise HTTPException(status_code=502, detail=f"OpenAI API hatası: {response.status_code}")
    data = response.json()
    choices = data.get('choices') or []
    if not choices:
        raise HTTPException(status_code=502, detail="OpenAI boş yanıt döndü.")
    return choices[0].get('message', {}).get('content', '') or ''


def _image_bytes_to_data_url(image_bytes: bytes, mime: str = "image/jpeg") -> str:
    """Goruntu baytlarini OpenAI vision icin data URL'ine cevir."""
    return f"data:{mime};base64,{base64.b64encode(image_bytes).decode('utf-8')}"

BATTERY_ANALYSIS_PROMPT = """Aşağıdaki görseller UNI-T UT673A cihazı ile yapılan bir akü testine aittir. Akü tipi (JEL, AGM, Kurşun-Asit vb.), kapasite ve kullanım amacı (marş aküsü, derin döngü/karavan aküsü, ek akü, servis aküsü vb.) hakkında HİÇBİR varsayımda bulunma. Cihazda hangi tipin seçildiği ve akünün hangi amaçla kullanıldığı sana bildirilmemiştir. Senin görevin yalnızca ölçülen değerleri yorumlamak ve akünün GENEL elektriksel sağlık durumunu raporlamaktır.

Aşağıdaki ÇOK ÖZEL formatta yanıt ver. Başka hiçbir başlık, preambül, tarih veya cihaz bilgisi EKLEME:

1. TEKNİK VERİLER:
- SOH: {değer} %
- SOC: {değer} %
- Voltaj: {değer} V
- İç Direnç: {değer} mΩ

2. TEKNİK DEĞERLENDİRME:
{Burada 2-4 cümlelik teknik analiz yaz. Sadece ölçülen SOH/SOC/Voltaj/İç Direnç değerlerinin elektriksel anlamına odaklan. "Marş akımı", "ilk hareket", "cranking", "starter", "derin döngü", "deep-cycle", "araç çalıştırma", "yolculuk", "karavan kullanımı" gibi spesifik kullanım senaryolarına ASLA değinme. Sadece kapasite, enerji depolama, hücre sağlığı, iç iletkenlik, şarj durumu gibi NÖTR teknik kavramları kullan.}

3. NİHAİ KARAR VE ÖNERİ:
{Burada şu sade ifadelerden uygun olanı kullan: 'İyi Durumda', 'Şarj Edilmeli', 'Akü Değişimi Gereklidir', 'Teknik Ömrünü Tamamlamış - Değişim Gereklidir'. 1-2 cümle ek açıklama yapabilirsin, ama belirli bir akü tipi (JEL, AGM vb.) veya kullanım senaryosu (marş, karavan, ek akü vb.) ÖNERME ya da varsayma.}

KESIN KURALLAR:
- Yanıtın TAM OLARAK yukarıdaki 3 numaralı bölümle başlamalı.
- '1.', '2.', '3.' numaralı önekleri MUTLAKA kullan.
- Markdown başlık işareti (###, ##, #) ASLA kullanma.
- ** (bold) işaretlerini ASLA kullanma.
- "Marş", "ilk hareket", "cranking", "starter", "araç çalıştırma", "derin döngü", "deep-cycle", "karavan", "tekne", "yolculuk" kelimelerinin HİÇBİRİNİ kullanma.
- Bölüm başlıklarından ÖNCE veya SONRA fazladan açıklama, tarih, "Rapor Tarihi", "Test Cihazı" gibi bilgiler EKLEME.
- Rapor dili Türkçe, ciddi ve profesyonel olmalıdır."""


def _resize_image_to_720p(image_bytes: bytes) -> bytes:
    """Görseli 720p genişliğe küçült (aspect ratio koruyarak), JPEG'e çevir."""
    try:
        img = PILImage.open(BytesIO(image_bytes))
        # RGBA/PA modlarını RGB'ye çevir (JPEG için)
        if img.mode in ('RGBA', 'LA', 'P'):
            background = PILImage.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # 720p width hedefi (genişlik 720, yükseklik aspect oranı korunur)
        target_width = 720
        if img.width > target_width:
            ratio = target_width / float(img.width)
            new_height = int(img.height * ratio)
            img = img.resize((target_width, new_height), PILImage.Resampling.LANCZOS)

        out = BytesIO()
        img.save(out, format='JPEG', quality=85, optimize=True)
        out.seek(0)
        return out.read()
    except Exception as e:
        logger.error(f"Görsel resize hatası: {e}")
        # Fallback: orijinal bytes
        return image_bytes


def _call_ai_for_battery_analysis(image_bytes_list: list) -> str:
    """GPT-4o mini'ye akü test görsellerini gönderip Türkçe servis raporu al."""
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY tanımlı değil (backend/.env).")

    if not image_bytes_list:
        raise HTTPException(status_code=400, detail="En az bir görsel yüklemelisiniz.")

    content = [{"type": "text", "text": BATTERY_ANALYSIS_PROMPT}]
    for img_bytes in image_bytes_list:
        resized = _resize_image_to_720p(img_bytes)
        content.append({
            "type": "image_url",
            "image_url": {"url": _image_bytes_to_data_url(resized, "image/jpeg")}
        })

    messages = [{"role": "user", "content": content}]
    full_text = _call_openai_chat(messages, max_tokens=2048, temperature=0.4).strip()
    if not full_text:
        raise HTTPException(status_code=502, detail="AI yanıtında metin bulunamadı.")
    return full_text


# ============================================================================
# AI ÜRÜN ÇIKARMA (PDF / Excel / Görsel -> GPT-4o mini -> ürün listesi)
# ============================================================================

PRODUCT_EXTRACTION_PROMPT = """Sana bir tedarikçi fiyat listesi verildi (PDF, Excel içeriği veya görsel olabilir).
Görevin: Listedeki TÜM ürünleri yapılandırılmış veri olarak çıkarmak.

Her ürün için şu alanları doldur:
- name: Ürünün tam adı/modeli (zorunlu). Kategori başlıkları, açıklama satırları veya toplamlar ürün DEĞİLDİR, onları atla.
- brand: Marka adı (biliniyorsa, yoksa boş string).
- list_price: Liste/birim fiyat, SADECE sayı (para birimi sembolü, binlik ayıracı OLMADAN). Örn: "1.234,56 ₺" -> 1234.56
- discounted_price: İndirimli/iskontolu fiyat varsa sayı olarak, yoksa null.
- currency: Para birimi. Sembol/metni şuna çevir: $/USD/dolar -> "USD", €/EUR/euro -> "EUR", ₺/TL/TRY/lira -> "TRY". Belirsizse "USD".
- description: Varsa kısa açıklama, yoksa null.

KURALLAR:
- Fiyatı olmayan veya 0 olan satırları DAHİL ETME (bunlar genelde başlık/kategoridir).
- Türkçe sayı formatına dikkat et: nokta binlik, virgül ondalık ayıracıdır.
- Uydurma ürün ekleme; sadece dosyada GÖRDÜĞÜN ürünleri çıkar.
- Yanıtı SADECE JSON olarak ver."""


def _excel_to_text(data: bytes) -> str:
    """Excel dosyasini AI'ya metin olarak vermek icin CSV'ye cevir (tum sayfalar)."""
    try:
        sheets = pd.read_excel(BytesIO(data), sheet_name=None, header=None, dtype=str)
    except Exception as e:
        logger.warning(f"Excel pandas ile okunamadi: {e}")
        raise HTTPException(status_code=422, detail="Excel dosyası okunamadı.")
    chunks = []
    for sheet_name, df in sheets.items():
        chunks.append(f"--- Sayfa: {sheet_name} ---")
        chunks.append(df.fillna('').to_csv(index=False, header=False))
    text = "\n".join(chunks)
    return text[:200000]  # asiri buyuk dosyalari sinirla


def _doc_image_bytes(data: bytes) -> tuple:
    """Belge gorselini OKUNABILIR cozunurlukte tut (metin icin 720p'ye kucultme); JPEG'e cevir."""
    try:
        img = PILImage.open(BytesIO(data))
        if img.mode in ('RGBA', 'LA', 'P'):
            bg = PILImage.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            bg.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
            img = bg
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        max_dim = 2200  # metin okunabilirligini koru
        if max(img.width, img.height) > max_dim:
            ratio = max_dim / float(max(img.width, img.height))
            img = img.resize((int(img.width * ratio), int(img.height * ratio)), PILImage.Resampling.LANCZOS)
        out = BytesIO()
        img.save(out, format='JPEG', quality=90, optimize=True)
        out.seek(0)
        return out.read(), "image/jpeg"
    except Exception as e:
        logger.warning(f"Belge gorsel donusum hatasi: {e}")
        return data, "image/jpeg"


def _normalize_currency(value) -> str:
    s = str(value or '').strip().upper()
    if s in ('USD', 'EUR', 'TRY'):
        return s
    if '$' in s or 'USD' in s or 'DOLAR' in s:
        return 'USD'
    if '€' in s or 'EUR' in s or 'EURO' in s:
        return 'EUR'
    if '₺' in s or 'TL' in s or 'TRY' in s or 'LIRA' in s:
        return 'TRY'
    return 'USD'


def _pdf_extract_for_ai(data: bytes):
    """PDF'ten metin çıkar; metin yetersizse (taranmış olabilir) sayfaları görüntüye çevir.
    (text, [jpeg_bytes]) döner."""
    import fitz  # pymupdf
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as e:
        logger.warning(f"PDF açılamadı: {e}")
        raise HTTPException(status_code=422, detail="PDF dosyası okunamadı.")
    try:
        text_parts = [page.get_text() for page in doc]
        full_text = "\n".join(text_parts).strip()
        if len(full_text) >= 200:
            return full_text[:200000], []
        # Az metin -> sayfaları görüntüye çevir (maks 8 sayfa, vision ile oku)
        images = []
        for i in range(min(len(doc), 8)):
            pix = doc[i].get_pixmap(dpi=150)
            images.append(pix.tobytes("jpeg"))
        return full_text, images
    finally:
        doc.close()


def _extract_products_from_file(data: bytes, filename: str, ext: str, content_type: str) -> list:
    """Dosyayi GPT-4o mini'ye gonderip yapilandirilmis urun listesi al (KAYDETMEZ)."""
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY tanımlı değil (backend/.env).")

    is_pdf = ext == "pdf" or content_type == "application/pdf"
    is_excel = ext in ("xlsx", "xls")
    is_image = content_type.startswith("image/") or ext in ("png", "jpg", "jpeg", "webp")

    prompt = PRODUCT_EXTRACTION_PROMPT + '\n\nYanıtı {"products": [ ... ]} biçiminde tek bir JSON nesnesi olarak ver.'
    content = [{"type": "text", "text": prompt}]

    if is_excel:
        text = _excel_to_text(data)
        if not text.strip():
            raise HTTPException(status_code=422, detail="Excel dosyası boş görünüyor.")
        content.append({"type": "text", "text": f"\n\nFiyat listesi (Excel) içeriği:\n{text}"})
    elif is_pdf:
        text, page_images = _pdf_extract_for_ai(data)
        if text:
            content.append({"type": "text", "text": f"\n\nFiyat listesi (PDF) içeriği:\n{text}"})
        for jpeg in page_images:
            content.append({"type": "image_url", "image_url": {"url": _image_bytes_to_data_url(jpeg, "image/jpeg")}})
        if not text and not page_images:
            raise HTTPException(status_code=422, detail="PDF'ten içerik çıkarılamadı.")
    elif is_image:
        img_bytes, mime = _doc_image_bytes(data)
        content.append({"type": "image_url", "image_url": {"url": _image_bytes_to_data_url(img_bytes, mime)}})
    else:
        raise HTTPException(status_code=400, detail="Desteklenmeyen dosya türü.")

    messages = [{"role": "user", "content": content}]
    raw_text = _call_openai_chat(messages, max_tokens=8192, temperature=0.1, json_mode=True).strip()
    if not raw_text:
        return []

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError:
        # Modeli ```json ... ``` ile sarmis olabilir; temizleyip tekrar dene
        cleaned = re.sub(r'^```(?:json)?|```$', '', raw_text.strip(), flags=re.MULTILINE).strip()
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            logger.error(f"AI ürün JSON parse edilemedi: {raw_text[:300]}")
            raise HTTPException(status_code=502, detail="AI yanıtı çözümlenemedi, tekrar deneyin.")

    if isinstance(parsed, dict):
        # tek obje ya da {products:[...]} sarmali olabilir
        parsed = parsed.get('products') or parsed.get('items') or [parsed]
    if not isinstance(parsed, list):
        return []

    products = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        name = str(item.get('name') or '').strip()
        if not name:
            continue
        try:
            list_price = float(item.get('list_price') or 0)
        except (ValueError, TypeError):
            continue
        if list_price <= 0:
            continue
        dp = item.get('discounted_price')
        try:
            discounted_price = float(dp) if dp not in (None, '', 0, '0') else None
        except (ValueError, TypeError):
            discounted_price = None
        products.append({
            "name": name[:500],
            "brand": str(item.get('brand') or '').strip()[:200],
            "list_price": list_price,
            "discounted_price": discounted_price,
            "currency": _normalize_currency(item.get('currency')),
            "description": (str(item.get('description')).strip()[:2000] if item.get('description') else None),
        })
    return products


@api_router.post("/battery-analysis")
async def battery_analysis(files: List[UploadFile] = File(...)):
    """
    Tek bir akü için UT673A test görsellerini GPT-4o mini ile analiz et.
    Maks. 5 görsel önerilir.
    """
    if not files or len(files) == 0:
        raise HTTPException(status_code=400, detail="En az bir görsel yüklemelisiniz.")
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="En fazla 10 görsel yüklenebilir.")

    image_bytes_list = []
    for f in files:
        # Sadece görsel dosyaları kabul et
        content_type = (f.content_type or '').lower()
        if not content_type.startswith('image/'):
            raise HTTPException(
                status_code=400,
                detail=f"Geçersiz dosya türü: {f.filename} ({content_type}). Sadece görsel dosyaları kabul edilir."
            )
        data = await f.read()
        if not data:
            continue
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Görsel çok büyük: {f.filename} (en fazla {MAX_UPLOAD_BYTES // (1024*1024)} MB)."
            )
        image_bytes_list.append(data)

    if not image_bytes_list:
        raise HTTPException(status_code=400, detail="Geçerli görsel verisi bulunamadı.")

    # AI cagrisi senkron; FastAPI thread havuzunda çalıştır
    loop = asyncio.get_event_loop()
    report_text = await loop.run_in_executor(None, _call_ai_for_battery_analysis, image_bytes_list)

    # Görselleri base64 olarak da geri döndür (frontend önizleme + PDF için)
    images_b64 = []
    for img in image_bytes_list:
        resized = _resize_image_to_720p(img)
        images_b64.append(base64.b64encode(resized).decode('utf-8'))

    return {
        "success": True,
        "report": report_text,
        "image_count": len(image_bytes_list),
        "images_base64": images_b64,
        "model": OPENAI_MODEL,
        "analyzed_at": datetime.now(timezone.utc).isoformat()
    }


# --- PDF Üretimi: Akü Test Raporu ---

class BatteryReportItem(BaseModel):
    battery_number: int
    report: str
    images_base64: Optional[List[str]] = None  # Sadece base64 string, prefix yok


class BatteryReportPDFRequest(BaseModel):
    customer_name: Optional[str] = None
    vehicle_plate: Optional[str] = None
    report_date: Optional[str] = None
    batteries: List[BatteryReportItem]


def _strip_markdown_headings(text: str) -> str:
    """### başlıkları ve diğer markdown başlık işaretlerini temizle."""
    import re as _re
    if not text:
        return ""
    # ### başlıklarını temizle (satır başında)
    text = _re.sub(r'^\s*#{1,6}\s*', '', text, flags=_re.MULTILINE)
    return text


def _parse_battery_report(report_text: str):
    """
    AI raporunu 3 bölüme ayrıştır:
      - data_pairs: [(etiket, değer), ...]  (TEKNİK VERİLER)
      - evaluation: str (TEKNİK DEĞERLENDİRME)
      - decision: str (NİHAİ KARAR VE ÖNERİ)
    Numara olsun veya olmasın, anahtar kelimelerle başlıkları tanır.
    Markdown bold (**) ve başlık (###) işaretleri temizlenir.
    """
    import re as _re
    if not report_text:
        return [], "", ""

    text = _strip_markdown_headings(report_text)
    # **bold** -> bold (gereksiz ** işaretlerini kaldır)
    text = _re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    # Tekil * vurgularını da temizle (cümle ortasında olmayan)
    text = _re.sub(r'(?<![\w\*])\*(?!\s)([^\*\n]+?)\*(?![\w\*])', r'\1', text)

    # Bölüm başlık desenleri:
    # - "1. TEKNİK VERİLER" / "1) TEKNİK VERİLER" / "TEKNİK VERİLER"
    # - Sonunda ":" olabilir / olmayabilir
    # - "İ" ve "I" karakterlerini eşitlemek için her ikisini de eşle
    section_patterns = [
        ('data',       r'(?:^|\n)\s*(?:\d+[\.\)]\s*)?TEKN[İIıi]K\s+VER[İIıi]LER\s*:?\s*(?=\n|$)'),
        ('evaluation', r'(?:^|\n)\s*(?:\d+[\.\)]\s*)?TEKN[İIıi]K\s+DEĞERLEND[İIıi]RME\s*:?\s*(?=\n|$)'),
        ('decision',   r'(?:^|\n)\s*(?:\d+[\.\)]\s*)?N[İIıi]HA[İIıi]\s+KARAR(?:\s+VE\s+ÖNER[İIıi])?\s*:?\s*(?=\n|$)'),
    ]

    boundaries = []  # liste: (anahtar, start_pos, end_pos)
    for key, pat in section_patterns:
        for m in _re.finditer(pat, text, _re.IGNORECASE):
            boundaries.append((key, m.start(), m.end()))
            break  # her bölüm için sadece ilk eşleşmeyi al

    boundaries.sort(key=lambda x: x[1])

    sections = {}
    for i, (key, start, end) in enumerate(boundaries):
        next_start = boundaries[i + 1][1] if (i + 1) < len(boundaries) else len(text)
        sections[key] = text[end:next_start].strip()

    # Bölüm 1 -> key:value listesi
    data_pairs = []
    if 'data' in sections:
        for raw in sections['data'].split('\n'):
            line = _re.sub(r'^[\s\-\*•·>]+', '', raw).strip()
            # Sondaki noktalama temizliği
            line = _re.sub(r'[\s\.,;]+$', '', line)
            if not line:
                continue
            # "SOH: 95%" veya "SOH = 95%" veya "SOH 95%" (boşlukla)
            kv = _re.match(r'^([A-Za-zÇĞİıÖŞÜçğıöşü][^\n:=]{1,40})\s*[:=]\s*(.+)$', line)
            if not kv:
                # ":/=" yoksa, "SOH 95%" gibi formatı dene
                kv2 = _re.match(r'^([A-Za-zÇĞİıÖŞÜçğıöşü\s]{2,40}?)\s+([0-9].*)$', line)
                if kv2:
                    kv = kv2
            if kv:
                k = kv.group(1).strip()
                v = kv.group(2).strip()
                if len(k) <= 60 and v:
                    data_pairs.append((k, v))

    evaluation = sections.get('evaluation', '').strip()
    decision = sections.get('decision', '').strip()

    # Hiç bölüm bulunamadıysa, tüm metni evaluation'a koy (defensif fallback)
    if not boundaries:
        evaluation = text.strip()

    return data_pairs, evaluation, decision


def _decision_color(decision_text: str):
    """Karar metnine göre renk paleti döndür: bg, border, text."""
    if not decision_text:
        return colors.HexColor('#f1f5f9'), colors.HexColor('#cbd5e1'), colors.HexColor('#334155')
    low = decision_text.lower()
    # Kötü (değişim gerekli)
    if any(k in low for k in ['değişim', 'degisim', 'ömrünü tamamlamış', 'omrunu tamamlamis', 'kullanılamaz', 'kullanilamaz']):
        return colors.HexColor('#fef2f2'), colors.HexColor('#fca5a5'), colors.HexColor('#991b1b')
    # Orta (şarj edilmeli)
    if any(k in low for k in ['şarj', 'sarj', 'bakım', 'bakim', 'orta']):
        return colors.HexColor('#fffbeb'), colors.HexColor('#fcd34d'), colors.HexColor('#92400e')
    # İyi
    if any(k in low for k in ['iyi durumda', 'iyi durumdadir', 'sağlıklı', 'saglikli', 'mükemmel', 'mukemmel', 'normal']):
        return colors.HexColor('#ecfdf5'), colors.HexColor('#86efac'), colors.HexColor('#065f46')
    # Default
    return colors.HexColor('#eff6ff'), colors.HexColor('#93c5fd'), colors.HexColor('#1e3a8a')


def _build_battery_report_pdf(payload: BatteryReportPDFRequest) -> BytesIO:
    """Akü test sonuçlarını profesyonel PDF formatında üret."""
    import re as _re
    buffer = BytesIO()

    # PDFQuoteGenerator'ın font/stil altyapısını yeniden kullan
    gen = PDFQuoteGenerator()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2*cm,
        leftMargin=2*cm,
        topMargin=1.8*cm,
        bottomMargin=1.8*cm,
        title="Akü Test Raporu",
        author="Çorlu Karavan"
    )

    story = []

    # Üst başlık (Çorlu Karavan)
    story.append(gen._create_modern_header())
    story.append(Spacer(1, 14))

    # Rapor başlığı (alt başlık YOK - akü tipi sabit değil)
    title_style = ParagraphStyle(
        'BatteryReportTitle',
        parent=gen.styles['Heading1'],
        fontName=gen.get_font_name(is_bold=True),
        fontSize=20,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#2F4B68'),
        spaceAfter=12,
        leading=24
    )
    story.append(Paragraph("AKÜ TEST RAPORU", title_style))

    # Müşteri / araç / tarih bilgi tablosu
    today_str = datetime.now().strftime('%d.%m.%Y')
    report_date_str = payload.report_date or today_str
    info_data = [
        [
            Paragraph("<b>Müşteri:</b>", gen.normal_style),
            Paragraph(payload.customer_name or "-", gen.normal_style),
            Paragraph("<b>Plaka / Araç:</b>", gen.normal_style),
            Paragraph(payload.vehicle_plate or "-", gen.normal_style),
        ],
        [
            Paragraph("<b>Rapor Tarihi:</b>", gen.normal_style),
            Paragraph(report_date_str, gen.normal_style),
            Paragraph("<b>Toplam Akü:</b>", gen.normal_style),
            Paragraph(str(len(payload.batteries)), gen.normal_style),
        ],
    ]
    info_table = Table(info_data, colWidths=[3.2*cm, 5.3*cm, 3.2*cm, 5.3*cm])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f7fafc')),
        ('FONTNAME', (0, 0), (-1, -1), gen.get_font_name()),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 14))

    # Stiller
    battery_title_style = ParagraphStyle(
        'BatterySectionTitle',
        parent=gen.styles['Heading2'],
        fontName=gen.get_font_name(is_bold=True),
        fontSize=14,
        textColor=colors.HexColor('#dc2626'),
        spaceBefore=4,
        spaceAfter=8,
        leading=18
    )
    section_label_style = ParagraphStyle(
        'BatterySectionLabel',
        parent=gen.styles['Normal'],
        fontName=gen.get_font_name(is_bold=True),
        fontSize=11,
        textColor=colors.HexColor('#2F4B68'),
        spaceBefore=4,
        spaceAfter=4,
        leading=14
    )
    section_body_style = ParagraphStyle(
        'BatterySectionBody',
        parent=gen.styles['Normal'],
        fontName=gen.get_font_name(),
        fontSize=10,
        textColor=colors.HexColor('#1f2937'),
        leading=14,
        alignment=TA_LEFT
    )

    for idx, batt in enumerate(payload.batteries):
        # Akü başlığı
        story.append(Paragraph(f"{batt.battery_number}. AKÜ", battery_title_style))

        # Görseller (varsa) — 3 sütunlu küçük thumbnail tablosu
        if batt.images_base64:
            try:
                thumbs = []
                for b64 in batt.images_base64[:6]:
                    try:
                        img_bytes = base64.b64decode(b64)
                        img_io = BytesIO(img_bytes)
                        img = Image(img_io, width=4.5*cm, height=4.5*cm, kind='proportional')
                        thumbs.append(img)
                    except Exception as e:
                        logger.warning(f"PDF thumbnail decode hatası: {e}")
                if thumbs:
                    rows = []
                    for i in range(0, len(thumbs), 3):
                        row = thumbs[i:i+3]
                        while len(row) < 3:
                            row.append("")
                        rows.append(row)
                    img_table = Table(rows, colWidths=[5.5*cm]*3)
                    img_table.setStyle(TableStyle([
                        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('TOPPADDING', (0, 0), (-1, -1), 3),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
                    ]))
                    story.append(img_table)
                    story.append(Spacer(1, 8))
            except Exception as e:
                logger.warning(f"Görsel ekleme hatası: {e}")

        # Rapor metnini parse et
        data_pairs, evaluation_text, decision_text = _parse_battery_report(batt.report or "")

        # --- BÖLÜM 1: TEKNİK VERİLER (tablo) ---
        story.append(Paragraph("1. TEKNİK VERİLER", section_label_style))
        if data_pairs:
            # 2 sütunlu: Parametre | Değer (başlık satırı dahil)
            tbl_data = [[
                Paragraph("<b>Parametre</b>", gen.normal_style),
                Paragraph("<b>Ölçüm Değeri</b>", gen.normal_style),
            ]]
            for k, v in data_pairs:
                tbl_data.append([
                    Paragraph(k, gen.normal_style),
                    Paragraph(v, gen.normal_style),
                ])
            data_table = Table(tbl_data, colWidths=[7.5*cm, 9.5*cm])
            data_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2F4B68')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('FONTNAME', (0, 0), (-1, -1), gen.get_font_name()),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cbd5e1')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('LEFTPADDING', (0, 0), (-1, -1), 10),
                ('RIGHTPADDING', (0, 0), (-1, -1), 10),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
                # Başlık satırını override
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2F4B68')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ]))
            story.append(data_table)
        else:
            story.append(Paragraph("<i>Ölçüm değerleri okunamadı.</i>", section_body_style))
        story.append(Spacer(1, 10))

        # --- BÖLÜM 2: TEKNİK DEĞERLENDİRME (renkli kutu) ---
        story.append(Paragraph("2. TEKNİK DEĞERLENDİRME", section_label_style))
        if evaluation_text:
            # Kutuyu tek hücreli tablo olarak yap
            eval_html = evaluation_text.replace('\r\n', '\n').replace('\n', '<br/>')
            # Liste işaretlerini de güzel yap
            eval_html = _re.sub(r'<br/>\s*[\-\*•·]\s+', r'<br/>&nbsp;&nbsp;• ', eval_html)
            eval_html = _re.sub(r'^\s*[\-\*•·]\s+', r'&nbsp;&nbsp;• ', eval_html)
            eval_para = Paragraph(eval_html, ParagraphStyle(
                'EvalBody',
                parent=section_body_style,
                fontSize=10,
                leading=15,
                textColor=colors.HexColor('#1e3a5f'),
            ))
            eval_box = Table([[eval_para]], colWidths=[17*cm])
            eval_box.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#eff6ff')),
                ('BOX', (0, 0), (-1, -1), 0.8, colors.HexColor('#93c5fd')),
                ('LINEBEFORE', (0, 0), (0, -1), 3, colors.HexColor('#2563eb')),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
                ('LEFTPADDING', (0, 0), (-1, -1), 14),
                ('RIGHTPADDING', (0, 0), (-1, -1), 12),
            ]))
            story.append(eval_box)
        story.append(Spacer(1, 10))

        # --- BÖLÜM 3: NİHAİ KARAR (renkli kutu - karara göre renk) ---
        story.append(Paragraph("3. NİHAİ KARAR VE ÖNERİ", section_label_style))
        if decision_text:
            bg_color, border_color, text_color = _decision_color(decision_text)
            dec_html = decision_text.replace('\r\n', '\n').replace('\n', '<br/>')
            dec_html = _re.sub(r'<br/>\s*[\-\*•·]\s+', r'<br/>&nbsp;&nbsp;• ', dec_html)
            dec_html = _re.sub(r'^\s*[\-\*•·]\s+', r'&nbsp;&nbsp;• ', dec_html)
            dec_para = Paragraph(
                f"<b>{dec_html}</b>" if len(dec_html) < 100 else dec_html,
                ParagraphStyle(
                    'DecBody',
                    parent=section_body_style,
                    fontSize=11,
                    leading=16,
                    textColor=text_color,
                )
            )
            dec_box = Table([[dec_para]], colWidths=[17*cm])
            dec_box.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), bg_color),
                ('BOX', (0, 0), (-1, -1), 1.0, border_color),
                ('LINEBEFORE', (0, 0), (0, -1), 4, border_color),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 12),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
                ('LEFTPADDING', (0, 0), (-1, -1), 16),
                ('RIGHTPADDING', (0, 0), (-1, -1), 14),
            ]))
            story.append(dec_box)
        story.append(Spacer(1, 14))

        # Ayraç çizgi (son akü değilse)
        if idx < len(payload.batteries) - 1:
            from reportlab.platypus import HRFlowable
            story.append(HRFlowable(width="100%", thickness=0.6, color=colors.HexColor('#cbd5e1')))
            story.append(Spacer(1, 10))

    # --- Footer: Çorlu Karavan Teknik Servis - Mehmet Necdet Zamkı ---
    story.append(Spacer(1, 18))
    footer_title_style = ParagraphStyle(
        'BatteryReportFooterTitle',
        parent=gen.styles['Normal'],
        fontName=gen.get_font_name(is_bold=True),
        fontSize=13,
        textColor=colors.HexColor('#111827'),
        alignment=TA_CENTER,
        leading=18,
        spaceAfter=2
    )
    footer_line_style = ParagraphStyle(
        'BatteryReportFooterLine',
        parent=gen.styles['Normal'],
        fontName=gen.get_font_name(is_bold=True),
        fontSize=11,
        textColor=colors.HexColor('#1f2937'),
        alignment=TA_CENTER,
        leading=16,
        spaceAfter=2
    )
    story.append(Paragraph("Çorlu Karavan Teknik Servis - Mehmet Necdet Zamkı", footer_title_style))
    story.append(Paragraph(f"Tarih: {report_date_str}", footer_line_style))
    story.append(Paragraph("Kullanılan Test Cihazı: UNI-T UT673A", footer_line_style))

    # Logo (alt-orta)
    logo_path = Path(__file__).parent / 'images' / 'corlu_karavan_logo_new.png'
    if logo_path.exists():
        try:
            story.append(Spacer(1, 10))
            footer_logo = Image(str(logo_path), width=3.2*cm, height=3.2*cm, kind='proportional')
            footer_logo.hAlign = 'CENTER'
            story.append(footer_logo)
        except Exception as e:
            logger.warning(f"Footer logo hatası: {e}")

    doc.build(story)
    buffer.seek(0)
    return buffer


@api_router.post("/battery-analysis/pdf")
async def battery_analysis_pdf(request: BatteryReportPDFRequest):
    """Birden fazla akü analiz sonucundan profesyonel PDF rapor üret."""
    if not request.batteries or len(request.batteries) == 0:
        raise HTTPException(status_code=400, detail="PDF üretmek için en az bir akü raporu gereklidir.")

    try:
        pdf_buf = _build_battery_report_pdf(request)
        filename = f"aku_test_raporu_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        return StreamingResponse(
            io.BytesIO(pdf_buf.read()),
            media_type='application/pdf',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"'
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Akü PDF üretim hatası: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF üretim hatası: {str(e)}")


# ============================================================================
# İNTERNET FİYAT ARAMA ENDPOİNT (Gemini AI ile)
# ============================================================================

class MarketPriceRequest(BaseModel):
    product_name: str
    brand: Optional[str] = ''

def _scrape_yahoo_prices(query: str):
    import urllib.request
    import urllib.parse
    from bs4 import BeautifulSoup
    import re
    
    url = f"https://search.yahoo.com/search?q={urllib.parse.quote_plus(query)}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    }
    
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=12) as r:
            html = r.read().decode('utf-8')
            
        soup = BeautifulSoup(html, 'html.parser')
        
        # Select list items from Yahoo search results
        results = soup.select('ol.searchCenterMiddle > li')
        if not results:
            # Fallback
            results = soup.find_all('div', class_=re.compile(r'algo|dd\s+algo|res'))
            
        parsed_results = []
        prices_found = []
        
        for res in results:
            # Title tag is h3
            title_el = res.select_one('h3')
            title = title_el.get_text().strip() if title_el else ""
            
            # URL is inside first anchor tag
            link_el = res.select_one('.compTitle a, a')
            raw_url = link_el.get('href') if link_el else ""
            
            if not title or not raw_url:
                continue
                
            # Decode Yahoo tracking URL
            real_url = raw_url
            if "r.search.yahoo.com" in raw_url:
                match = re.search(r'RU=([^/&]+)', raw_url)
                if match:
                    real_url = urllib.parse.unquote(match.group(1))
            
            # Skip Yahoo internal searches
            if any(domain in real_url.lower() for domain in ["images.search.yahoo.com", "video.search.yahoo.com", "search.yahoo.com/search"]):
                continue
                
            # Snippet text - prioritize compText and avoid matching generic classes
            snippet_el = res.select_one('.compText, p.fc-dustygray, .desc, .snippet')
            snippet = snippet_el.get_text().strip() if snippet_el else res.get_text().strip()
            
            # Look for price patterns in Turkish format
            combined_text = f"{title} {snippet}"
            
            # Match Turkish price formatting: e.g., 2.283,13 TL, 1.250 TL, 1250 TL, 1250.00 TL, 1250,00 TL, ₺1.250
            price_matches = re.findall(r'([\d\.]+,\d{2}|[\d\.]+)(?:\s*|\s+)(?:TL|TRY|₺)', combined_text, re.IGNORECASE)
            price_matches_alt = re.findall(r'(?:₺|TL|TRY)(?:\s*|\s+)([\d\.]+,\d{2}|[\d\.]+)', combined_text, re.IGNORECASE)
            
            all_candidates = price_matches + price_matches_alt
            extracted_price = None
            
            for p_str in all_candidates:
                p_clean = p_str.replace(" ", "")
                # Normalize decimals and thousands
                if "," in p_clean and "." in p_clean:
                    p_clean = p_clean.replace(".", "").replace(",", ".")
                elif "," in p_clean:
                    if re.search(r',\d{2}$', p_clean):
                        p_clean = p_clean.replace(",", ".")
                    else:
                        p_clean = p_clean.replace(",", "")
                elif "." in p_clean:
                    if len(p_clean.split(".")[-1]) == 3:
                        p_clean = p_clean.replace(".", "")
                
                try:
                    val = float(p_clean)
                    if 10 < val < 1000000:
                        extracted_price = val
                        break
                except ValueError:
                    continue
            
            # Map domain to site name
            site_name = "Diğer"
            sites_mapping = {
                "trendyol.com": "Trendyol",
                "hepsiburada.com": "Hepsiburada",
                "n11.com": "n11",
                "amazon.com.tr": "Amazon",
                "amazon.com": "Amazon",
                "akakce.com": "Akakçe",
                "cimri.com": "Cimri",
                "pazarama.com": "Pazarama",
                "teknosa.com": "Teknosa",
                "vatanbilgisayar.com": "Vatan",
                "mediamarkt.com.tr": "MediaMarkt"
            }
            
            for domain, label in sites_mapping.items():
                if domain in real_url.lower():
                    site_name = label
                    break
                    
            # Clean up title
            title = re.sub(r'https?://\S+', '', title)
            title = re.sub(r'\s+[\x07\x08]\s+', ' ', title)
            title = title.split("›")[-1].strip()
            if len(title) > 65:
                title = title[:62] + "..."
                
            if extracted_price:
                prices_found.append(extracted_price)
                parsed_results.append({
                    "site": site_name,
                    "title": title,
                    "price": extracted_price,
                    "currency": "TRY",
                    "url": real_url
                })
            
        average_price = round(sum(prices_found) / len(prices_found), 2) if prices_found else None
        
        # Sort results: Akakçe/Cimri first, then Trendyol/Hepsiburada, and prioritize entries with prices
        def sort_key(item):
            priority = 0
            if item["site"] in ["Akakçe", "Cimri"]: priority = 3
            elif item["site"] in ["Trendyol", "Hepsiburada", "Amazon", "n11"]: priority = 2
            elif item["site"] != "Diğer": priority = 1
            has_price = 1 if item["price"] is not None else 0
            return (has_price, priority)
            
        parsed_results.sort(key=sort_key, reverse=True)
        
        return {
            "results": parsed_results[:12],
            "average_price": average_price,
            "currency": "TRY",
            "note": "Arama sonuçları internet üzerinden canlı olarak listelendi." if parsed_results else "İnternet fiyatı bulunamadı."
        }
    except Exception as e:
        logger.error(f"Yahoo price search scrape error: {e}", exc_info=True)
        return {"results": [], "average_price": None, "currency": "TRY", "note": f"Arama hatası: {str(e)}"}

@api_router.post("/market-price-search")
async def market_price_search(request: MarketPriceRequest, current_user: str = Depends(get_current_user)):
    """Gemini AI veya ücretsiz arama fall-back'i kullanarak ürünün internet fiyatlarını araştır"""
    query = request.product_name
    if request.brand:
        query = f"{request.brand} {query}"

    # 1. EĞER GEMINI_API_KEY tanımlıysa, Gemini AI kullanarak Google Search grounding ile ara
    if GEMINI_API_KEY:
        try:
            prompt = f"""Türkiye'deki e-ticaret sitelerinde "{query}" ürününün güncel fiyatlarını araştır.

Trendyol, Hepsiburada, n11, GittiGidiyor, Amazon Türkiye ve diğer Türk e-ticaret sitelerinde bu ürünü veya çok benzer bir ürünü ara.

SADECE aşağıdaki JSON formatında yanıt ver, başka hiçbir şey yazma:
{{
  "results": [
    {{"site": "Site adı", "price": 1234, "currency": "TRY", "url": "https://..." }},
    {{"site": "Site adı", "price": 2345, "currency": "TRY", "url": "https://..." }}
  ],
  "average_price": 1789,
  "currency": "TRY",
  "note": "Varsa kısa bir not (opsiyonel)"
}}

Fiyat bulamazsan boş results listesi döndür. URL bilinmiyorsa null yaz. Fiyatları sayısal olarak ver."""

            async with aiohttp.ClientSession() as session:
                payload = {
                    "contents": [{"parts": [{"text": prompt}]}],
                    "tools": [{"google_search": {}}],
                    "generationConfig": {
                        "temperature": 0.1,
                        "maxOutputTokens": 1000,
                    }
                }
                async with session.post(
                    GEMINI_ENDPOINT,
                    params={"key": GEMINI_API_KEY},
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as resp:
                    resp.raise_for_status()
                    data = await resp.json()

            text = ""
            for candidate in data.get("candidates", []):
                for part in candidate.get("content", {}).get("parts", []):
                    if "text" in part:
                        text += part["text"]

            # JSON çıkar
            import re
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                return json.loads(json_match.group())
        except Exception as e:
            logger.error(f"Gemini price search failed, falling back to Yahoo scraping: {e}")

    # 2. GEMINI_API_KEY tanımlı değilse veya Gemini AI araması hata verirse, Yahoo Scraping Fallback'ini kullan
    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(None, _scrape_yahoo_prices, query)
        return result
    except Exception as e:
        logger.error(f"Market price search fallback error: {e}")
        raise HTTPException(status_code=500, detail=f"Arama hatası: {str(e)}")


# Include the router in the main app
# ===================== KABLO ŞEMASI (WIRING) MODÜLÜ =====================
# kablosemasi reposundan port edildi. Çakışmayı önlemek için tüm uçlar "wiring-"
# namespace'inde, koleksiyonlar "wiring_" önekiyle. Görseller Emergent object
# storage yerine MongoDB'de base64 saklanır; PDF cairosvg yerine svglib+reportlab
# ile üretilir (Windows uyumu).
from fastapi import UploadFile as _UploadFile, File as _File, Response as _Response
from urllib.parse import quote as _urlquote
import base64 as _base64

class WiringProjectCreate(BaseModel):
    name: str
    vehicle_name: Optional[str] = ""
    author: Optional[str] = ""
    description: Optional[str] = ""
    data: Dict[str, Any] = Field(default_factory=dict)

class WiringProjectUpdate(BaseModel):
    name: Optional[str] = None
    vehicle_name: Optional[str] = None
    author: Optional[str] = None
    description: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

class WiringProject(BaseModel):
    id: str
    name: str
    vehicle_name: str = ""
    author: str = ""
    description: str = ""
    data: Dict[str, Any] = Field(default_factory=dict)
    created_at: str
    updated_at: str

class WiringPdfExportRequest(BaseModel):
    svg: str
    paper: str = "A4"
    orientation: str = "landscape"
    title: str = ""
    vehicle_name: str = ""
    author: str = ""
    date: str = ""
    description: str = ""
    logo_url: Optional[str] = None

class WiringDeviceTemplatePort(BaseModel):
    id: Optional[str] = None
    name: str = "+"
    side: str = "left"
    offset: float = 0.5
    color: str = "#F8F9FA"

class WiringDeviceTemplatePayload(BaseModel):
    name: str
    category: str = "load"
    width: int = 120
    height: int = 90
    color: Optional[str] = None
    image_id: Optional[str] = None
    image_url: Optional[str] = None  # Karavan ürün görseli (harici URL) seçilmişse
    brand: str = ""
    model: str = ""
    rating_value: str = ""
    rating_unit: str = ""
    notes: str = ""
    ports: List[WiringDeviceTemplatePort] = Field(default_factory=list)

class WiringDeviceTemplate(WiringDeviceTemplatePayload):
    id: str
    is_custom: bool = True
    created_at: str
    updated_at: str

def _wiring_port_with_id(p: dict) -> dict:
    return {**p, "id": p.get("id") or f"p_{uuid.uuid4().hex[:6]}"}

# ---- Görsel upload / serve (MongoDB base64) ----
@api_router.post("/wiring-upload")
async def wiring_upload_image(file: _UploadFile = _File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Sadece resim dosyaları yüklenebilir.")
    ext = (file.filename or "").split(".")[-1].lower() if file.filename and "." in file.filename else "png"
    if ext not in ("png", "jpg", "jpeg", "webp", "gif"):
        ext = "png"
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Dosya boyutu çok büyük (maks. 10MB).")
    file_id = str(uuid.uuid4())
    doc = {
        "id": file_id,
        "content_type": file.content_type or f"image/{ext}",
        "original_filename": file.filename or f"{file_id}.{ext}",
        "size": len(data),
        "data_b64": _base64.b64encode(data).decode("ascii"),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.wiring_files.insert_one(doc.copy())
    return {"id": file_id, "url": f"/api/wiring-files/{file_id}", "path": file_id}

@api_router.get("/wiring-files/{file_id}")
async def wiring_get_file(file_id: str):
    record = await db.wiring_files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(404, "Dosya bulunamadı.")
    data = _base64.b64decode(record["data_b64"])
    return _Response(content=data, media_type=record.get("content_type", "image/png"))

# ---- Proje CRUD ----
@api_router.post("/wiring-projects", response_model=WiringProject)
async def wiring_create_project(payload: WiringProjectCreate):
    now = datetime.now(timezone.utc).isoformat()
    proj = {"id": str(uuid.uuid4()), "created_at": now, "updated_at": now, **payload.model_dump()}
    await db.wiring_projects.insert_one(proj.copy())
    return WiringProject(**proj)

@api_router.get("/wiring-projects", response_model=List[WiringProject])
async def wiring_list_projects():
    items = await db.wiring_projects.find({}, {"_id": 0}).sort("updated_at", -1).to_list(500)
    return [WiringProject(**i) for i in items]

@api_router.get("/wiring-projects/{project_id}", response_model=WiringProject)
async def wiring_get_project(project_id: str):
    item = await db.wiring_projects.find_one({"id": project_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Proje bulunamadı.")
    return WiringProject(**item)

@api_router.put("/wiring-projects/{project_id}", response_model=WiringProject)
async def wiring_update_project(project_id: str, payload: WiringProjectUpdate):
    existing = await db.wiring_projects.find_one({"id": project_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Proje bulunamadı.")
    update_data = payload.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.wiring_projects.update_one({"id": project_id}, {"$set": update_data})
    return WiringProject(**{**existing, **update_data})

@api_router.delete("/wiring-projects/{project_id}")
async def wiring_delete_project(project_id: str):
    res = await db.wiring_projects.delete_one({"id": project_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Proje bulunamadı.")
    return {"ok": True}

# ---- Cihaz şablonu CRUD ----
@api_router.post("/wiring-device-templates", response_model=WiringDeviceTemplate)
async def wiring_create_template(payload: WiringDeviceTemplatePayload):
    now = datetime.now(timezone.utc).isoformat()
    ports = [_wiring_port_with_id(p.model_dump()) for p in payload.ports]
    if not ports:
        ports = [
            {"id": f"p_{uuid.uuid4().hex[:6]}", "name": "+", "side": "left", "offset": 0.3, "color": "#FF3B30"},
            {"id": f"p_{uuid.uuid4().hex[:6]}", "name": "-", "side": "left", "offset": 0.7, "color": "#1C1C1E"},
        ]
    doc = {**payload.model_dump(), "id": f"custom_{uuid.uuid4().hex[:10]}", "ports": ports,
           "is_custom": True, "created_at": now, "updated_at": now}
    await db.wiring_device_templates.insert_one(doc.copy())
    return WiringDeviceTemplate(**doc)

@api_router.get("/wiring-device-templates", response_model=List[WiringDeviceTemplate])
async def wiring_list_templates():
    items = await db.wiring_device_templates.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    return [WiringDeviceTemplate(**i) for i in items]

@api_router.put("/wiring-device-templates/{template_id}", response_model=WiringDeviceTemplate)
async def wiring_update_template(template_id: str, payload: WiringDeviceTemplatePayload):
    existing = await db.wiring_device_templates.find_one({"id": template_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Şablon bulunamadı.")
    ports = [_wiring_port_with_id(p.model_dump()) for p in payload.ports]
    update = {**payload.model_dump(), "ports": ports, "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.wiring_device_templates.update_one({"id": template_id}, {"$set": update})
    return WiringDeviceTemplate(**{**existing, **update})

@api_router.delete("/wiring-device-templates/{template_id}")
async def wiring_delete_template(template_id: str):
    res = await db.wiring_device_templates.delete_one({"id": template_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Şablon bulunamadı.")
    return {"ok": True}

# ---- Arka plan kaldırma (Pillow, köşe flood-fill — beyaz/düz arka plan) ----
class WiringRemoveBgRequest(BaseModel):
    image_url: Optional[str] = None
    image_id: Optional[str] = None
    tolerance: int = 36

def _wiring_remove_bg(raw: bytes, tolerance: int = 36) -> bytes:
    from PIL import Image
    from collections import deque
    img = Image.open(BytesIO(raw)).convert("RGBA")
    # Çok büyük görselleri küçült (performans + Pi belleği)
    max_side = 700
    if max(img.size) > max_side:
        ratio = max_side / max(img.size)
        img = img.resize((int(img.size[0] * ratio), int(img.size[1] * ratio)))
    w, h = img.size
    px = img.load()
    ref = px[0, 0]  # sol-üst köşe = arka plan referansı
    def near(c):
        return abs(c[0] - ref[0]) <= tolerance and abs(c[1] - ref[1]) <= tolerance and abs(c[2] - ref[2]) <= tolerance
    visited = bytearray(w * h)
    dq = deque()
    for (cx, cy) in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        i = cy * w + cx
        if not visited[i]:
            visited[i] = 1
            dq.append((cx, cy))
    while dq:
        x, y = dq.popleft()
        r, g, b, a = px[x, y]
        if not near((r, g, b)):
            continue
        px[x, y] = (r, g, b, 0)  # şeffaf
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                i = ny * w + nx
                if not visited[i]:
                    visited[i] = 1
                    dq.append((nx, ny))
    out = BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()

@api_router.post("/wiring-remove-bg")
async def wiring_remove_bg(req: WiringRemoveBgRequest):
    # Kaynak görsel verisini al
    if req.image_id:
        rec = await db.wiring_files.find_one({"id": req.image_id, "is_deleted": False}, {"_id": 0})
        if not rec:
            raise HTTPException(404, "Görsel bulunamadı.")
        raw = _base64.b64decode(rec["data_b64"])
    elif req.image_url:
        try:
            resp = requests.get(req.image_url, timeout=20)
            resp.raise_for_status()
            raw = resp.content
        except Exception as e:
            raise HTTPException(400, f"Görsel indirilemedi: {e}")
    else:
        raise HTTPException(400, "image_url veya image_id gerekli.")
    try:
        out_bytes = await asyncio.to_thread(_wiring_remove_bg, raw, req.tolerance)
    except Exception as e:
        logger.error(f"Arka plan kaldırma hatası: {e}")
        raise HTTPException(500, f"Arka plan kaldırılamadı: {e}")
    file_id = str(uuid.uuid4())
    doc = {
        "id": file_id, "content_type": "image/png", "original_filename": f"{file_id}.png",
        "size": len(out_bytes), "data_b64": _base64.b64encode(out_bytes).decode("ascii"),
        "is_deleted": False, "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.wiring_files.insert_one(doc.copy())
    return {"id": file_id, "url": f"/api/wiring-files/{file_id}"}

# ---- PDF export (svglib + reportlab; cairosvg yerine Windows uyumu) ----
@api_router.post("/wiring-export-pdf")
async def wiring_export_pdf(req: WiringPdfExportRequest):
    if not req.svg or "<svg" not in req.svg:
        raise HTTPException(400, "Geçersiz SVG verisi.")
    try:
        from svglib.svglib import svg2rlg
        from reportlab.graphics import renderPDF
        drawing = svg2rlg(BytesIO(req.svg.encode("utf-8")))
        if drawing is None:
            raise ValueError("SVG çizime dönüştürülemedi")
        pdf_io = BytesIO()
        renderPDF.drawToFile(drawing, pdf_io)
        pdf_bytes = pdf_io.getvalue()
    except Exception as e:
        logger.error(f"Wiring PDF dönüştürme hatası: {e}")
        raise HTTPException(500, f"PDF dönüştürme hatası: {e}")
    raw_title = (req.title or "karavan-sema").strip() or "karavan-sema"
    ascii_fallback = raw_title.encode("ascii", "ignore").decode("ascii") or "karavan-sema"
    cd = f'attachment; filename="{ascii_fallback}.pdf"; filename*=UTF-8\'\'{_urlquote(raw_title, safe="")}.pdf'
    return _Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": cd})

# ===================== /WIRING MODÜLÜ SONU =====================


# ==================== SERVIS (Tadilat/Bakim) ENDPOINT'LERI ====================
_SERVICE_STATUSES = {"received", "in_progress", "delivered"}


@api_router.get("/services")
async def list_services(status: Optional[str] = None, search: Optional[str] = None):
    """Servis kayitlarini listele (en yeni once)."""
    query = {}
    if status and status in _SERVICE_STATUSES:
        query["status"] = status
    if search:
        rx = {"$regex": re.escape(search), "$options": "i"}
        query["$or"] = [
            {"customer_name": rx}, {"plate": rx},
            {"vehicle_brand": rx}, {"vehicle_model": rx},
        ]
    services = await db.services.find(query).sort("created_at", -1).to_list(1000)
    for s in services:
        s.pop("_id", None)
    return services


def _service_items_total(items):
    """Kalem listesinden toplam tutar (adet * birim fiyat)."""
    total = 0.0
    for it in (items or []):
        try:
            total += float(it.get("qty") or 0) * float(it.get("unit_price") or 0)
        except (TypeError, ValueError):
            continue
    return round(total, 2)


async def _next_service_order_no():
    """Sırayla artan iş emri numarası (İŞ-0001)."""
    from pymongo import ReturnDocument
    try:
        res = await db.counters.find_one_and_update(
            {"_id": "service_order"},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        seq = (res or {}).get("seq", 1)
    except Exception:
        seq = await db.services.count_documents({}) + 1
    return f"İŞ-{int(seq):04d}"


@api_router.post("/services")
async def create_service(payload: ServiceCreate):
    """Yeni servis kaydi olustur."""
    doc = payload.dict()
    if doc.get("status") not in _SERVICE_STATUSES:
        doc["status"] = "received"
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc)
    doc["order_no"] = await _next_service_order_no()
    # Kalem varsa toplam tutarı kalemlerden hesapla
    if doc.get("items"):
        doc["cost"] = _service_items_total(doc["items"])
    await db.services.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/services/history")
async def service_history(plate: Optional[str] = None, customer_name: Optional[str] = None, exclude_id: Optional[str] = None):
    """Aynı aracın (plaka) veya çekme karavanlarda müşterinin geçmiş servis kayıtları."""
    query = {}
    if plate and plate.strip():
        query["plate"] = {"$regex": f"^{re.escape(plate.strip())}$", "$options": "i"}
    elif customer_name and customer_name.strip():
        query["plate"] = {"$in": [None, ""]}
        query["customer_name"] = {"$regex": f"^{re.escape(customer_name.strip())}$", "$options": "i"}
    else:
        return []
    if exclude_id:
        query["id"] = {"$ne": exclude_id}
    records = await db.services.find(query).sort("created_at", -1).to_list(200)
    for r in records:
        r.pop("_id", None)
    return records


@api_router.get("/services/{service_id}")
async def get_service(service_id: str):
    service = await db.services.find_one({"id": service_id})
    if not service:
        raise HTTPException(status_code=404, detail="Servis kaydı bulunamadı")
    service.pop("_id", None)
    return service


@api_router.put("/services/{service_id}")
async def update_service(service_id: str, payload: ServiceUpdate):
    existing = await db.services.find_one({"id": service_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Servis kaydı bulunamadı")
    update_data = {k: v for k, v in payload.dict(exclude_unset=True).items()}
    if "status" in update_data and update_data["status"] not in _SERVICE_STATUSES:
        update_data.pop("status")
    # Kalem güncellendiyse toplam tutarı yeniden hesapla
    if "items" in update_data:
        update_data["cost"] = _service_items_total(update_data.get("items"))
    if update_data:
        await db.services.update_one({"id": service_id}, {"$set": update_data})
    service = await db.services.find_one({"id": service_id})
    service.pop("_id", None)
    return service


@api_router.delete("/services/{service_id}")
async def delete_service(service_id: str):
    result = await db.services.delete_one({"id": service_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Servis kaydı bulunamadı")
    return {"success": True, "message": "Servis kaydı silindi"}


# ==================== SÖZLEŞMELER ENDPOINT'LERI ====================
def upper_tr(s):
    if not s:
        return ""
    s = str(s)
    replaces = {
        "i": "İ",
        "ı": "I",
        "ş": "Ş",
        "ğ": "Ğ",
        "ü": "Ü",
        "ö": "Ö",
        "ç": "Ç"
    }
    for k, v in replaces.items():
        s = s.replace(k, v)
    return s.upper().strip()

def parse_contract_data(sheets):
    if not sheets or not isinstance(sheets, list) or len(sheets) == 0:
        return None
    rows = sheets[0].get("rows", [])
    if not rows:
        return None
        
    def num_of(v):
        if v is None or v == '':
            return None
        s = str(v).strip()
        s = re.sub(r'[^\d.,-]', '', s)
        if not s:
            return None
        if ',' in s:
            s = s.replace('.', '').replace(',', '.')
        try:
            return float(s)
        except ValueError:
            return None
            
    header_idx = -1
    col = {"sno": 0, "qty": None, "eur": None, "tl": None, "total": None, "kur": None}
    name_col = 1
    
    for i in range(min(len(rows), 15)):
        r = rows[i]
        if any("TUTAR" in upper_tr(c) for c in r):
            header_idx = i
            best_len = -1
            for ci, c in enumerate(r):
                u = upper_tr(c)
                if not u:
                    continue
                if u in ("S.NO", "NO", "SNO", "S NO"):
                    col["sno"] = ci
                elif "ADET" in u:
                    col["qty"] = ci
                elif "EUR" in u:
                    col["eur"] = ci
                elif "TL F" in u or ("TL" in u and "YAT" in u):
                    col["tl"] = ci
                elif "TUTAR" in u:
                    col["total"] = ci
                elif "KUR" in u:
                    col["kur"] = ci
                elif len(u) > best_len:
                    best_len = len(u)
                    name_col = ci
            break
            
    if header_idx < 0 or col["total"] is None:
        return None
        
    subtitle = str(rows[header_idx][name_col]) if rows[header_idx] and name_col < len(rows[header_idx]) else ""
    subtitle = upper_tr(subtitle)
    
    raw_sections = []
    current_sec = {"name": "", "items": []}
    notes = []
    grand_total = None
    kur = None
    after_total = False
    
    def cell_at(r, idx):
        if idx is not None and idx < len(r) and r[idx] is not None:
            return str(r[idx]).strip()
        return ""
        
    for i in range(header_idx + 1, len(rows)):
        r = rows[i]
        if not r:
            continue
            
        name = cell_at(r, name_col)
        eur = cell_at(r, col["eur"])
        tl_unit_str = cell_at(r, col["tl"])
        total_str = cell_at(r, col["total"])
        sno = cell_at(r, col["sno"])
        qty = cell_at(r, col["qty"])
        kur_str = cell_at(r, col.get("kur"))
        
        if kur is None and kur_str:
            kur = num_of(kur_str)
            
        u = upper_tr(name)
        if not name and not total_str and not eur:
            continue
            
        if "GENEL TOPLAM" in u:
            grand_total = num_of(total_str)
            after_total = True
            continue
            
        if after_total:
            if "ÇORLU KARAVAN" in u or u == "MÜŞTERİ" or "ZAMKI" in u or "İMZA" in u:
                continue
            if "EURO KUR" in u or "KAÇ EURO" in u or "KARŞILIĞI" in u:
                continue
            if name:
                notes.append(upper_tr(name))
            continue
            
        if eur != '':
            current_sec["items"].append({
                "sno": sno,
                "name": upper_tr(name),
                "qty": qty,
                "eurUnit": num_of(eur),
                "tlUnit": num_of(tl_unit_str),
                "total": num_of(total_str)
            })
        elif name:
            if current_sec["items"]:
                raw_sections.append(current_sec)
            current_sec = {"name": upper_tr(name), "items": []}
            
    if current_sec["items"]:
        raw_sections.append(current_sec)
        
    if not raw_sections:
        return None
        
    # --- Auto-categorization: SİNEKLİKLER - TENTE - BASAMAKLAR ---
    def should_move_to_diger(item_name):
        if not item_name:
            return True
        n = upper_tr(item_name)
        has_kw = "SİNEKLİK" in n or "TENTE" in n or "BASAMAK" in n or "SİNEKLIK" in n
        if not has_kw:
            return True
        if any(w in n for w in ("PROJE", "MUAYENE", "EMİSYON", "RUHSAT", "HİZMET BEDELİ")):
            return True
        return False
        
    processed_sections = []
    moved_items = []
    
    for sec in raw_sections:
        sec_name_up = upper_tr(sec["name"])
        is_target_sec = "SİNEKLİK" in sec_name_up or "TENTE" in sec_name_up or "BASAMAK" in sec_name_up
        
        if is_target_sec:
            valid_items = []
            for item in sec["items"]:
                if should_move_to_diger(item["name"]):
                    moved_items.append(item)
                else:
                    valid_items.append(item)
            sec["items"] = valid_items
            processed_sections.append(sec)
        else:
            processed_sections.append(sec)
            
    if moved_items:
        diger_sec = None
        for sec in processed_sections:
            if upper_tr(sec["name"]) == "DİĞER":
                diger_sec = sec
                break
        if diger_sec:
            diger_sec["items"].extend(moved_items)
        else:
            processed_sections.append({
                "name": "DİĞER",
                "items": moved_items
            })
            
    # --- Sequential numbering ---
    counter = 1
    for sec in processed_sections:
        for it in sec["items"]:
            it["sno"] = str(counter)
            counter += 1
            
    eur_total = grand_total / kur if grand_total is not None and kur else None
    
    return {
        "subtitle": subtitle,
        "sections": processed_sections,
        "notes": notes,
        "grandTotal": grand_total,
        "eurTotal": eur_total,
        "kur": kur,
        "originalKur": kur
    }

def _parse_excel_for_preview(data: bytes):
    """Excel'i tarayicida onizlemek icin sayfalara/hucrelere ayir.
    [{name, rows: [[hucre,...],...]}] doner. Satir/sutun makul sinirlanir."""
    MAX_ROWS, MAX_COLS = 400, 40
    sheets = []
    try:
        wb = openpyxl.load_workbook(BytesIO(data), data_only=True, read_only=True)
    except Exception:
        # Eski .xls vb. icin pandas dene
        try:
            dfs = pd.read_excel(BytesIO(data), sheet_name=None, header=None, dtype=str)
        except Exception as e:
            logger.warning(f"Sozlesme Excel parse hatasi: {e}")
            return []
        for name, df in dfs.items():
            rows = df.fillna('').astype(str).values.tolist()[:MAX_ROWS]
            sheets.append({"name": str(name), "rows": [r[:MAX_COLS] for r in rows]})
        return sheets
    try:
        for ws in wb.worksheets:
            rows = []
            for r_i, row in enumerate(ws.iter_rows(values_only=True)):
                if r_i >= MAX_ROWS:
                    break
                rows.append([("" if c is None else str(c)) for c in row][:MAX_COLS])
            # Sondaki tamamen bos satirlari kirp
            while rows and all(c == "" for c in rows[-1]):
                rows.pop()
            sheets.append({"name": ws.title, "rows": rows})
    finally:
        wb.close()
    return sheets


def _excel_doc_date(data: bytes):
    """Excel dosyasinin KENDI metadata tarihini dondur (degistirilme, yoksa olusturma).
    Yukleme tarihi DEGIL; dosyanin docProps/core.xml bilgisinden okunur."""
    try:
        wb = openpyxl.load_workbook(BytesIO(data), read_only=True)
        props = wb.properties
        wb.close()
        d = props.modified or props.created
        if d is None:
            return None
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d
    except Exception as e:
        logger.warning(f"Excel belge tarihi okunamadi: {e}")
        return None


@api_router.post("/contracts")
async def create_contract(
    file: UploadFile = File(...),
    title: str = Form(...),
    customer_name: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
):
    """Excel sozlesme yukle: tarayici onizlemesi icin ayristir ve sakla."""
    fname = file.filename or "sozlesme.xlsx"
    ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
    if ext not in ("xlsx", "xlsm", "xls"):
        raise HTTPException(status_code=400, detail="Sadece Excel dosyaları (.xlsx/.xls) kabul edilir.")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Boş dosya.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Dosya çok büyük (en fazla {MAX_UPLOAD_BYTES // (1024*1024)} MB).")

    sheets = _parse_excel_for_preview(data)
    if not sheets:
        raise HTTPException(status_code=422, detail="Excel içeriği okunamadı.")

    parsed_data = parse_contract_data(sheets)

    doc = {
        "id": str(uuid.uuid4()),
        "title": upper_tr(title or fname)[:300],
        "customer_name": (upper_tr(customer_name) if customer_name else None),
        "notes": (upper_tr(notes) if notes else None),
        "file_name": fname,
        "sheets": sheets,
        "file_b64": base64.b64encode(data).decode("utf-8"),  # orijinali indirebilmek icin
        "doc_date": _excel_doc_date(data),  # Excel'in kendi tarihi (yukleme degil)
        "created_at": datetime.now(timezone.utc),
        "data": parsed_data
    }
    await db.contracts.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("file_b64", None)
    return doc


@api_router.get("/contracts")
async def list_contracts():
    """Sozlesme listesi (hafif: sheets/file_b64 haric)."""
    docs = await db.contracts.find({}, {"sheets": 0, "file_b64": 0, "_id": 0}).sort("created_at", -1).to_list(1000)
    return docs


@api_router.get("/contracts/{contract_id}")
async def get_contract(contract_id: str):
    """Tek sozlesme (onizleme verisi dahil)."""
    doc = await db.contracts.find_one({"id": contract_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Sözleşme bulunamadı")
    # Eski kayitlarda doc_date yoksa dosyadan hesapla ve kaydet (backfill)
    if not doc.get("doc_date") and doc.get("file_b64"):
        try:
            dd = _excel_doc_date(base64.b64decode(doc["file_b64"]))
            if dd:
                await db.contracts.update_one({"id": contract_id}, {"$set": {"doc_date": dd}})
                doc["doc_date"] = dd
        except Exception:
            pass
    doc.pop("_id", None)
    doc.pop("file_b64", None)
    return doc


def _contract_data_to_xlsx(doc) -> bytes:
    """Duzenlenmis yapisal sozlesme verisinden yeni bir Excel olustur."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter
    data = doc.get("data") or {}
    wb = Workbook()
    ws = wb.active
    ws.title = "Sozlesme"
    navy = "1B3A5C"
    bold = Font(bold=True)
    white_bold = Font(bold=True, color="FFFFFF")
    hdr_fill = PatternFill("solid", fgColor=navy)
    sec_fill = PatternFill("solid", fgColor="E8EEF4")
    right = Alignment(horizontal="right")

    ws.append([doc.get("title") or "Sözleşme"])
    ws["A1"].font = Font(bold=True, size=14)
    if doc.get("customer_name"):
        ws.append(["Müşteri", doc["customer_name"]])
    if data.get("subtitle"):
        ws.append([data["subtitle"]])
    kur = data.get("kur")
    if kur:
        ws.append(["Sözleşme Kuru", f"1 € = ₺{kur}"])
    ws.append([])

    headers = ["No", "İşlem", "Adet", "Birim (€)", "Birim (₺)", "Tutar (₺)"]
    ws.append(headers)
    hr = ws.max_row
    for c in range(1, len(headers) + 1):
        cell = ws.cell(row=hr, column=c)
        cell.font = white_bold
        cell.fill = hdr_fill

    for sec in data.get("sections", []):
        ws.append([sec.get("name", "")])
        srow = ws.max_row
        ws.cell(row=srow, column=1).font = bold
        for c in range(1, len(headers) + 1):
            ws.cell(row=srow, column=c).fill = sec_fill
        for it in sec.get("items", []):
            ws.append([
                it.get("sno", ""),
                it.get("name", ""),
                it.get("qty", ""),
                it.get("eurUnit"),
                it.get("tlUnit"),
                it.get("total"),
            ])

    ws.append([])
    if data.get("grandTotal") is not None:
        ws.append(["", "GENEL TOPLAM", "", "", "", data["grandTotal"]])
        gr = ws.max_row
        ws.cell(row=gr, column=2).font = bold
        ws.cell(row=gr, column=6).font = bold
    if data.get("eurTotal") is not None:
        ws.append(["", "EUR Karşılığı", "", "", "", round(data["eurTotal"], 2)])

    notes = data.get("notes") or []
    if notes or doc.get("notes"):
        ws.append([])
        ws.append(["NOTLAR"])
        ws.cell(row=ws.max_row, column=1).font = bold
        for n in notes:
            ws.append([n])
        if doc.get("notes"):
            ws.append([doc["notes"]])

    for i, w in enumerate([6, 52, 8, 12, 14, 16], start=1):
        ws.column_dimensions[get_column_letter(i)].width = w

    out = BytesIO()
    wb.save(out)
    out.seek(0)
    return out.read()


@api_router.get("/contracts/{contract_id}/download")
async def download_contract(contract_id: str):
    """Sözleşmeyi Excel olarak indir. Düzenlenmişse düzenlenmiş halini, değilse orijinali verir."""
    doc = await db.contracts.find_one({"id": contract_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Sözleşme bulunamadı")

    edited = bool(doc.get("data") and (doc["data"].get("sections")))
    if edited:
        data = _contract_data_to_xlsx(doc)
        raw_name = (doc.get("title") or "sozlesme") + ".xlsx"
    else:
        data = base64.b64decode(doc.get("file_b64", "") or "")
        raw_name = doc.get("file_name") or "sozlesme.xlsx"
    if not data:
        raise HTTPException(status_code=404, detail="Dosya bulunamadı")
    ascii_name = raw_name.encode("ascii", "ignore").decode("ascii") or "sozlesme.xlsx"
    if not ascii_name.lower().endswith((".xlsx", ".xls", ".xlsm")):
        ascii_name += ".xlsx"
    return StreamingResponse(
        BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{ascii_name}"'},
    )


@api_router.put("/contracts/{contract_id}")
async def update_contract(contract_id: str, payload: ContractUpdate):
    """Sozlesme baslik/musteri/not guncelle."""
    existing = await db.contracts.find_one({"id": contract_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Sözleşme bulunamadı")
    upd = {k: v for k, v in payload.dict(exclude_unset=True).items()}
    if upd:
        await db.contracts.update_one({"id": contract_id}, {"$set": upd})
    doc = await db.contracts.find_one({"id": contract_id}, {"_id": 0, "file_b64": 0, "sheets": 0})
    return doc


@api_router.post("/contracts/{contract_id}/copy")
async def copy_contract(contract_id: str):
    """Sozlesmeyi kopyala (yeni id, baslik + ' (Kopya)')."""
    src = await db.contracts.find_one({"id": contract_id})
    if not src:
        raise HTTPException(status_code=404, detail="Sözleşme bulunamadı")
    src.pop("_id", None)
    src["id"] = str(uuid.uuid4())
    src["title"] = ((src.get("title") or "Sözleşme") + " (Kopya)")[:300]
    src["created_at"] = datetime.now(timezone.utc)
    await db.contracts.insert_one(src)
    src.pop("_id", None)
    src.pop("file_b64", None)
    src.pop("sheets", None)
    return src


@api_router.delete("/contracts/{contract_id}")
async def delete_contract(contract_id: str):
    result = await db.contracts.delete_one({"id": contract_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sözleşme bulunamadı")
    return {"success": True, "message": "Sözleşme silindi"}


@api_router.post("/contracts/new")
async def create_blank_contract(payload: NewContractPayload):
    """Sıfırdan boş sözleşme oluştur."""
    now = datetime.now(timezone.utc)
    doc = {
        "id": str(uuid.uuid4()),
        "title": upper_tr(payload.title)[:300],
        "customer_name": (upper_tr(payload.customer_name) if payload.customer_name else None),
        "notes": (upper_tr(payload.notes) if payload.notes else None),
        "file_name": "Sıfırdan Oluşturuldu",
        "sheets": [],
        "file_b64": "",
        "doc_date": now,
        "created_at": now,
        "data": {
            "subtitle": "Müşteri Teklif Formu ve Sözleşme",
            "sections": [],
            "notes": [],
            "grandTotal": 0,
            "eurTotal": 0,
            "kur": payload.kur or 35.0,
            "originalKur": payload.kur or 35.0
        }
    }
    await db.contracts.insert_one(doc)
    doc.pop("_id", None)
    return doc


from reportlab.platypus import Flowable

class RoundedCard(Flowable):
    def __init__(self, flowables, width, bg_color, border_color=None, border_width=1, corner_radius=8, padding=0):
        super().__init__()
        self.flowables = flowables
        self.width = width
        self.bg_color = bg_color
        self.border_color = border_color
        self.border_width = border_width
        self.corner_radius = corner_radius
        self.padding = padding
        self.height = 0
        
    def wrap(self, availWidth, availHeight):
        content_width = self.width - 2 * self.padding
        self.height = 2 * self.padding
        for f in self.flowables:
            w, h = f.wrap(content_width, availHeight)
            self.height += h
        return self.width, self.height
        
    def draw(self):
        canvas = self.canv
        canvas.saveState()
        
        # 1. Background and Border
        canvas.setFillColor(self.bg_color)
        stroke = 1 if self.border_color else 0
        if stroke:
            canvas.setStrokeColor(self.border_color)
            canvas.setLineWidth(self.border_width)
            
        canvas.roundRect(0, 0, self.width, self.height, self.corner_radius, stroke=stroke, fill=1)
        
        # 2. Bezier Rounded Clipping Mask
        def add_round_rect_to_path(p, x, y, w, h, r):
            c = 0.552284749831
            p.moveTo(x + r, y)
            p.lineTo(x + w - r, y)
            p.curveTo(x + w - r * (1 - c), y,
                      x + w, y + r * (1 - c),
                      x + w, y + r)
            p.lineTo(x + w, y + h - r)
            p.curveTo(x + w, y + h - r * (1 - c),
                      x + w - r * (1 - c), y + h,
                      x + w - r, y + h)
            p.lineTo(x + r, y + h)
            p.curveTo(x + r * (1 - c), y + h,
                      x, y + h - r * (1 - c),
                      x, y + h - r)
            p.lineTo(x, y + r)
            p.curveTo(x, y + r * (1 - c),
                      x + r * (1 - c), y,
                      x + r, y)
                      
        p = canvas.beginPath()
        add_round_rect_to_path(p, 0, 0, self.width, self.height, self.corner_radius)
        p.close()
        canvas.clipPath(p, stroke=0, fill=0)
        
        # 3. Draw content
        y_cursor = self.height - self.padding
        content_width = self.width - 2 * self.padding
        for f in self.flowables:
            w, h = f.wrap(content_width, y_cursor)
            y_cursor -= h
            canvas.saveState()
            canvas.translate(self.padding, y_cursor)
            f.canv = canvas
            f.draw()
            canvas.restoreState()
            
        canvas.restoreState()


class PDFContractGenerator(PDFQuoteGenerator):
    def __init__(self):
        super().__init__()
        self.contract_title_style = ParagraphStyle(
            'ContractTitle',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=15,
            textColor=colors.white,
            alignment=TA_LEFT,
            leading=18
        )
        self.contract_subtitle_style = ParagraphStyle(
            'ContractSubtitle',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(),
            fontSize=9.5,
            textColor=colors.white,
            alignment=TA_LEFT,
            leading=12
        )
        self.contract_meta_style = ParagraphStyle(
            'ContractMeta',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=9,
            textColor=colors.white,
            alignment=TA_RIGHT,
            leading=12
        )
        # --- Banner / GENEL TOPLAM premium stilleri ---
        self.contract_eyebrow_style = ParagraphStyle(
            'ContractEyebrow',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=7,
            textColor=colors.HexColor('#9FB7D1'),
            alignment=TA_LEFT,
            leading=10,
            spaceAfter=3
        )
        self.contract_brand_title_style = ParagraphStyle(
            'ContractBrandTitle',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=18,
            textColor=colors.white,
            alignment=TA_LEFT,
            leading=21
        )
        self.contract_meta_label_style = ParagraphStyle(
            'ContractMetaLabel',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=6.5,
            textColor=colors.HexColor('#8AA6C4'),
            alignment=TA_RIGHT,
            leading=8
        )
        self.contract_meta_value_style = ParagraphStyle(
            'ContractMetaValue',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=10,
            textColor=colors.white,
            alignment=TA_RIGHT,
            leading=13
        )
        self.gt_label_style = ParagraphStyle(
            'ContractGTLabel',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=10,
            textColor=colors.white,
            alignment=TA_LEFT,
            leading=13
        )
        self.gt_sub_style = ParagraphStyle(
            'ContractGTSub',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(),
            fontSize=7.5,
            textColor=colors.HexColor('#9FB7D1'),
            alignment=TA_LEFT,
            leading=10,
            spaceBefore=2
        )
        self.gt_amount_style = ParagraphStyle(
            'ContractGTAmount',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=23,
            textColor=colors.white,
            alignment=TA_RIGHT,
            leading=25
        )
        self.gt_eur_style = ParagraphStyle(
            'ContractGTEur',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=10.5,
            textColor=colors.HexColor('#9FE7C8'),
            alignment=TA_RIGHT,
            leading=13,
            spaceBefore=3
        )
        self.table_header_style = ParagraphStyle(
            'ContractTableHeader',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=8,
            textColor=colors.white,
            alignment=TA_LEFT
        )
        self.table_header_right_style = ParagraphStyle(
            'ContractTableHeaderRight',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=8,
            textColor=colors.white,
            alignment=TA_RIGHT
        )
        self.table_header_center_style = ParagraphStyle(
            'ContractTableHeaderCenter',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=8,
            textColor=colors.white,
            alignment=TA_CENTER
        )
        self.table_cell_style = ParagraphStyle(
            'ContractTableCell',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(),
            fontSize=8,
            textColor=colors.HexColor('#2D3748'),
            leading=10
        )
        self.table_cell_bold = ParagraphStyle(
            'ContractTableCellBold',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=8,
            textColor=colors.HexColor('#1B3A5C'),
            leading=10
        )
        self.table_cell_right = ParagraphStyle(
            'ContractTableCellRight',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(),
            fontSize=8,
            textColor=colors.HexColor('#2D3748'),
            alignment=TA_RIGHT,
            leading=10
        )
        self.table_cell_right_bold = ParagraphStyle(
            'ContractTableCellRightBold',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=8,
            textColor=colors.HexColor('#1B3A5C'),
            alignment=TA_RIGHT,
            leading=10
        )
        self.note_title_style = ParagraphStyle(
            'ContractNoteTitle',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=9,
            textColor=colors.HexColor('#92400E'),
            spaceAfter=4
        )
        self.note_text_style = ParagraphStyle(
            'ContractNoteText',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(),
            fontSize=8.5,
            textColor=colors.HexColor('#78350F'),
            leading=11
        )
        self.data_style_bold = ParagraphStyle(
            'DataStyleBold',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(is_bold=True),
            fontSize=9,
            textColor=colors.HexColor('#2D3748'),
            alignment=TA_LEFT
        )
        self.data_style_center = ParagraphStyle(
            'DataStyleCenter',
            parent=self.styles['Normal'],
            fontName=self.get_font_name(),
            fontSize=9,
            textColor=colors.HexColor('#718096'),
            alignment=TA_CENTER
        )

    def _draw_page_decorations(self, canvas, doc):
        """Sözleşme için sayfa altlarında slogan/iletişim olmasın, sadece sayfa numarası ve üst accent şerit olsun."""
        canvas.saveState()
        width, height = A4
        primary = colors.HexColor(self.PROP_PRIMARY)

        # Üst ince accent şerit
        canvas.setFillColor(primary)
        canvas.rect(0, height - 6, width, 6, stroke=0, fill=1)

        # Sayfa numarası (en altta sağda)
        canvas.setFont(self.get_font_name(), 8)
        canvas.setFillColor(colors.HexColor('#718096'))
        canvas.drawRightString(width - 1.5 * cm, 1.0 * cm, f"Sayfa {doc.page}")
        canvas.restoreState()

    def create_contract_pdf(self, contract_data: Dict) -> BytesIO:
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=1.5*cm,
            leftMargin=1.5*cm,
            topMargin=1.5*cm,
            bottomMargin=1.5*cm,
            title=f"Sözleşme - {contract_data.get('title', 'Sözleşme')}",
            author="Çorlu Karavan"
        )
        story = []
        
        logo_paths = [
            Path("public/logo.png"),
            Path(__file__).parent / "public" / "logo.png",
            Path(__file__).parent.parent / "public" / "logo.png"
        ]
        logo_path = None
        for p in logo_paths:
            if p.exists():
                logo_path = p
                break
                
        logo_flowable = None
        if logo_path:
            try:
                from reportlab.platypus import Image as PDFImage
                # Logo kare (375x375); bozulmaması için kare oran, banner yüksekliğini doldursun
                logo_flowable = PDFImage(str(logo_path), width=60, height=60)
            except Exception as e:
                logger.error(f"Error loading logo in contract PDF: {e}")
                
        title_text = contract_data.get("title") or "SÖZLEŞME"
        eyebrow_p = Paragraph("MÜŞTERİ TEKLİF FORMU & SÖZLEŞME", self.contract_eyebrow_style)
        title_p = Paragraph(f"<b>{upper_tr(title_text)}</b>", self.contract_brand_title_style)

        customer_name = contract_data.get("customer_name")
        customer_p = None
        if customer_name:
            customer_p = Paragraph(f"Müşteri  ·  <b>{upper_tr(customer_name)}</b>", self.contract_subtitle_style)

        left_flowables = [eyebrow_p, title_p]
        if customer_p:
            left_flowables.append(Spacer(1, 5))
            left_flowables.append(customer_p)
            
        doc_date_val = contract_data.get("doc_date") or contract_data.get("created_at")
        if isinstance(doc_date_val, str):
            try:
                dt = datetime.fromisoformat(doc_date_val.replace('Z', '+00:00'))
                date_str = dt.strftime('%d.%m.%Y')
            except Exception:
                date_str = doc_date_val[:10]
        elif isinstance(doc_date_val, datetime):
            date_str = doc_date_val.strftime('%d.%m.%Y')
        else:
            date_str = datetime.now().strftime('%d.%m.%Y')
            
        data_block = contract_data.get("data") or {}
        meta_pairs = [("TARİH", date_str)]
        kur = data_block.get("kur")
        if kur:
            kur_str = f"{round(float(kur)):,.0f}".replace(",", ".")
            meta_pairs.append(("DÖVİZ KURU", f"1 € = ₺{kur_str}"))

        meta_flowables = []
        for mi, (label, value) in enumerate(meta_pairs):
            if mi > 0:
                meta_flowables.append(Spacer(1, 6))
            meta_flowables.append(Paragraph(label, self.contract_meta_label_style))
            meta_flowables.append(Paragraph(value, self.contract_meta_value_style))
        meta_p = meta_flowables

        header_left_cell = left_flowables
        if logo_flowable:
            from reportlab.platypus import Table as PDFTable
            logo_title_tbl = PDFTable([[logo_flowable, left_flowables]], colWidths=[2.5*cm, 9.8*cm])
            logo_title_tbl.setStyle(TableStyle([
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('LEFTPADDING', (0,0), (-1,-1), 0),
                ('RIGHTPADDING', (0,0), (0,0), 12),
                ('RIGHTPADDING', (1,0), (1,0), 0),
                ('TOPPADDING', (0,0), (-1,-1), 0),
                ('BOTTOMPADDING', (0,0), (-1,-1), 0),
            ]))
            header_left_cell = logo_title_tbl
            
        header_tbl = PDFTable([[header_left_cell, meta_p]], colWidths=[12.3*cm, 5.7*cm])
        header_tbl.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,-1), 15),
            ('BOTTOMPADDING', (0,0), (-1,-1), 15),
            ('LEFTPADDING', (0,0), (0,-1), 18),
            ('LEFTPADDING', (1,0), (1,-1), 0),
            ('RIGHTPADDING', (0,0), (0,-1), 8),
            ('RIGHTPADDING', (1,0), (1,-1), 18),
            # İmza yeşili sol dikey accent (bölüm bantlarıyla aynı dil)
            ('LINEBEFORE', (0,0), (0,-1), 4, colors.HexColor('#10B981')),
        ]))
        
        # Sitedeki gibi üst banner köşelerini yuvarla
        header_card = RoundedCard(
            [header_tbl],
            width=18.0*cm,
            bg_color=colors.HexColor('#1B3A5C'),
            border_color=None,
            corner_radius=8,
            padding=0
        )
        story.append(header_card)
        story.append(Spacer(1, 14))
        
        headers = [
            Paragraph("<b>#</b>", self.table_header_center_style),
            Paragraph("<b>İŞLEM</b>", self.table_header_style),
            Paragraph("<b>ADET</b>", self.table_header_center_style),
            Paragraph("<b>BİRİM (€)</b>", self.table_header_right_style),
            Paragraph("<b>BİRİM (₺)</b>", self.table_header_right_style),
            Paragraph("<b>TUTAR (₺)</b>", self.table_header_right_style),
        ]
        
        table_rows = [headers]
        table_styles = [
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1B3A5C')),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('LINEBELOW', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
            ('LINEAFTER', (0,0), (-2,-1), 0.5, colors.HexColor('#CBD5E1')),
            ('TOPPADDING', (0,0), (-1,-1), 5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 5),
            ('LEFTPADDING', (0,0), (-1,-1), 4),
            ('RIGHTPADDING', (0,0), (-1,-1), 4),
            # Alignments matching web UI
            ('ALIGN', (0,0), (0,-1), 'CENTER'),
            ('ALIGN', (1,0), (1,-1), 'LEFT'),
            ('ALIGN', (2,0), (2,-1), 'CENTER'),
            ('ALIGN', (3,0), (-1,-1), 'RIGHT'),
        ]
        
        def fmt(val, currency=""):
            if val is None:
                return ""
            # Kuruş gösterme: tam sayıya yuvarla (frontend formatPrice ile tutarlı)
            v_str = f"{round(float(val)):,.0f}".replace(",", ".")
            if currency == "EUR":
                return f"€ {v_str}"
            elif currency == "TRY":
                return f"₺ {v_str}"
            return v_str
            
        sections = data_block.get("sections") or []
        row_idx = 1
        
        for si, sec in enumerate(sections):
            sec_title_p = Paragraph(f"<b>{si+1:02d} · {upper_tr(sec.get('name'))}</b>", self.table_cell_bold)
            table_rows.append([sec_title_p, "", "", "", "", ""])
            table_styles.append(('SPAN', (0, row_idx), (5, row_idx)))
            table_styles.append(('BACKGROUND', (0, row_idx), (5, row_idx), colors.HexColor('#F1F5F9')))
            row_idx += 1
            
            for it in sec.get("items", []):
                sno_p = Paragraph(str(it.get("sno", "")), self.table_cell_style)
                name_p = Paragraph(upper_tr(it.get("name", "")), self.table_cell_style)
                qty_val = it.get("qty")
                qty_p = Paragraph(str(qty_val) if qty_val and qty_val != '0' else "", self.table_cell_style)
                
                eur_p = Paragraph(fmt(it.get("eurUnit"), "EUR"), self.table_cell_right)
                tl_p = Paragraph(fmt(it.get("tlUnit"), "TRY"), self.table_cell_right)
                tot_p = Paragraph(fmt(it.get("total"), "TRY"), self.table_cell_right_bold)
                
                table_rows.append([sno_p, name_p, qty_p, eur_p, tl_p, tot_p])
                row_idx += 1
                
            subtotal = sum(float(item.get("total") or 0) for item in sec.get("items", []))
            sub_label_p = Paragraph("<b>BÖLÜM TOPLAMI</b>", self.table_cell_bold)
            sub_val_p = Paragraph(f"<b>{fmt(subtotal, 'TRY')}</b>", self.table_cell_right_bold)
            
            table_rows.append([sub_label_p, "", "", "", "", sub_val_p])
            table_styles.append(('SPAN', (0, row_idx), (4, row_idx)))
            table_styles.append(('BACKGROUND', (0, row_idx), (5, row_idx), colors.HexColor('#F8FAFC')))
            table_styles.append(('ALIGN', (0, row_idx), (4, row_idx), 'RIGHT'))
            row_idx += 1
            
        contract_table = PDFTable(table_rows, colWidths=[0.8*cm, 8.2*cm, 1.2*cm, 2.3*cm, 2.5*cm, 3.0*cm])
        contract_table.setStyle(TableStyle(table_styles))
        
        # Sitedeki gibi ürün listesi etrafının kenarlarını yuvarla (Yalnızca tek sayfaya sığıyorsa)
        w_t, table_height = contract_table.wrap(18.0*cm, 10000)
        if table_height < 580:
            table_card = RoundedCard(
                [contract_table],
                width=18.0*cm,
                bg_color=colors.white,
                border_color=colors.HexColor('#CBD5E1'),
                border_width=0.5,
                corner_radius=8,
                padding=0
            )
            story.append(table_card)
        else:
            story.append(contract_table)
        story.append(Spacer(1, 14))
        
        gt = data_block.get("grandTotal")
        et = data_block.get("eurTotal")
        if gt is not None:
            # Sol: etiket + alt açıklama  |  Sağ: büyük tutar + EUR karşılığı
            gt_left = [
                Paragraph("GENEL TOPLAM", self.gt_label_style),
                Paragraph("KDV HARİÇ  ·  Net Ödenecek Tutar", self.gt_sub_style),
            ]
            gt_right = [Paragraph(f"<b>{fmt(gt, 'TRY')}</b>", self.gt_amount_style)]
            if et is not None:
                gt_right.append(Paragraph(f"≈ {fmt(et, 'EUR')}", self.gt_eur_style))

            gt_tbl = PDFTable([[gt_left, gt_right]], colWidths=[8.3*cm, 9.7*cm])
            gt_tbl.setStyle(TableStyle([
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('TOPPADDING', (0,0), (-1,-1), 16),
                ('BOTTOMPADDING', (0,0), (-1,-1), 16),
                ('LEFTPADDING', (0,0), (0,-1), 18),
                ('LEFTPADDING', (1,0), (1,-1), 0),
                ('RIGHTPADDING', (0,0), (0,-1), 8),
                ('RIGHTPADDING', (1,0), (1,-1), 18),
                ('LINEBEFORE', (0,0), (0,-1), 4, colors.HexColor('#10B981')),
            ]))

            # Sitedeki gibi genel toplam köşelerini yuvarla
            gt_card = RoundedCard(
                [gt_tbl],
                width=18.0*cm,
                bg_color=colors.HexColor('#1B3A5C'),
                border_color=None,
                corner_radius=8,
                padding=0
            )
            story.append(gt_card)
            story.append(Spacer(1, 14))
            
        notes_list = data_block.get("notes") or []
        general_note = contract_data.get("notes")
        
        if notes_list or general_note:
            note_flowables = [Paragraph("<b>NOTLAR & ŞARTLAR</b>", self.note_title_style)]
            for n in notes_list:
                if n.strip():
                    note_flowables.append(Paragraph(f"• {upper_tr(n)}", self.note_text_style))
            if general_note:
                if notes_list:
                    note_flowables.append(Spacer(1, 4))
                note_flowables.append(Paragraph(upper_tr(general_note), self.note_text_style))
                
            note_tbl = PDFTable([[note_flowables]], colWidths=[18.0*cm])
            note_tbl.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#FEF3C7')),
                ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#FDE68A')),
                ('TOPPADDING', (0,0), (-1,-1), 10),
                ('BOTTOMPADDING', (0,0), (-1,-1), 10),
                ('LEFTPADDING', (0,0), (-1,-1), 12),
                ('RIGHTPADDING', (0,0), (-1,-1), 12),
            ]))
            
            # Notlar ve şartlar tablosunu da şık bir şekilde yuvarla (Yalnızca sığıyorsa)
            w_n, note_height = note_tbl.wrap(18.0*cm, 10000)
            if note_height < 500:
                note_card = RoundedCard(
                    [note_tbl],
                    width=18.0*cm,
                    bg_color=colors.HexColor('#FEF3C7'),
                    border_color=colors.HexColor('#FDE68A'),
                    border_width=0.5,
                    corner_radius=8,
                    padding=0
                )
                story.append(note_card)
            else:
                story.append(note_tbl)
            story.append(Spacer(1, 14))
            
        sig_left = [
            Paragraph("<b>Çorlu Karavan</b>", self.data_style_bold),
            Spacer(1, 24),
            Paragraph("Yetkili İmza", self.data_style_center)
        ]
        sig_right = [
            Paragraph(f"<b>{upper_tr(customer_name or 'Müşteri')}</b>", self.data_style_bold),
            Spacer(1, 24),
            Paragraph("Müşteri İmza", self.data_style_center)
        ]
        
        sig_tbl = PDFTable([[sig_left, sig_right]], colWidths=[9.0*cm, 9.0*cm])
        sig_tbl.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ('LINEABOVE', (0,0), (-1,0), 0.5, colors.HexColor('#E2E8F0')),
            ('TOPPADDING', (0,0), (-1,-1), 10),
        ]))
        story.append(KeepTogether([sig_tbl]))
        
        doc.build(story, onFirstPage=self._draw_page_decorations, onLaterPages=self._draw_page_decorations)
        buffer.seek(0)
        return buffer


class PDFServiceGenerator(PDFContractGenerator):
    """Servis / İş Emri teslim formu PDF üreticisi (sözleşme stillerini yeniden kullanır)."""

    def create_service_pdf(self, svc: Dict) -> BytesIO:
        from reportlab.platypus import Table as PDFTable, Image as PDFImage
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer, pagesize=A4,
            rightMargin=1.5*cm, leftMargin=1.5*cm, topMargin=1.5*cm, bottomMargin=1.5*cm,
            title=f"Servis Formu - {svc.get('order_no', '')}", author="Çorlu Karavan",
        )
        story = []

        def fmt(val):
            try:
                return f"₺ {round(float(val)):,.0f}".replace(",", ".")
            except (TypeError, ValueError):
                return "₺ 0"

        # ---- Logo ----
        logo_flowable = None
        for p in [Path("public/logo.png"), Path(__file__).parent / "public" / "logo.png", Path(__file__).parent.parent / "public" / "logo.png"]:
            if p.exists():
                try:
                    logo_flowable = PDFImage(str(p), width=60, height=60)
                except Exception:
                    logo_flowable = None
                break

        # ---- Üst banner ----
        eyebrow_p = Paragraph("SERVİS · İŞ EMRİ / TESLİM FORMU", self.contract_eyebrow_style)
        title_p = Paragraph(f"<b>{upper_tr(svc.get('order_no') or 'SERVİS KAYDI')}</b>", self.contract_brand_title_style)
        cust = svc.get("customer_name")
        left_flowables = [eyebrow_p, title_p]
        if cust:
            left_flowables.append(Spacer(1, 5))
            left_flowables.append(Paragraph(f"Müşteri  ·  <b>{upper_tr(cust)}</b>", self.contract_subtitle_style))

        def _fmt_date(d):
            if not d:
                return "—"
            try:
                return datetime.fromisoformat(str(d).replace('Z', '+00:00')).strftime('%d.%m.%Y')
            except Exception:
                return str(d)[:10]

        meta_pairs = [("TARİH", _fmt_date(svc.get("arrival_date") or svc.get("created_at")))]
        meta_flowables = []
        for mi, (label, value) in enumerate(meta_pairs):
            if mi > 0:
                meta_flowables.append(Spacer(1, 6))
            meta_flowables.append(Paragraph(label, self.contract_meta_label_style))
            meta_flowables.append(Paragraph(value, self.contract_meta_value_style))

        header_left_cell = left_flowables
        if logo_flowable:
            logo_title_tbl = PDFTable([[logo_flowable, left_flowables]], colWidths=[2.5*cm, 9.8*cm])
            logo_title_tbl.setStyle(TableStyle([
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('LEFTPADDING', (0,0), (-1,-1), 0), ('RIGHTPADDING', (0,0), (0,0), 12),
                ('RIGHTPADDING', (1,0), (1,0), 0), ('TOPPADDING', (0,0), (-1,-1), 0), ('BOTTOMPADDING', (0,0), (-1,-1), 0),
            ]))
            header_left_cell = logo_title_tbl

        header_tbl = PDFTable([[header_left_cell, meta_flowables]], colWidths=[12.3*cm, 5.7*cm])
        header_tbl.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,-1), 15), ('BOTTOMPADDING', (0,0), (-1,-1), 15),
            ('LEFTPADDING', (0,0), (0,-1), 18), ('LEFTPADDING', (1,0), (1,-1), 0),
            ('RIGHTPADDING', (0,0), (0,-1), 8), ('RIGHTPADDING', (1,0), (1,-1), 18),
            ('LINEBEFORE', (0,0), (0,-1), 4, colors.HexColor('#10B981')),
        ]))
        story.append(RoundedCard([header_tbl], width=18.0*cm, bg_color=colors.HexColor('#1B3A5C'), corner_radius=8, padding=0))
        story.append(Spacer(1, 14))

        # ---- Müşteri & Araç bilgi kartı ----
        is_trailer = svc.get("is_trailer") or not (svc.get("plate") or "").strip()
        vehicle = " ".join([x for x in [svc.get("vehicle_brand"), svc.get("vehicle_model")] if x]).strip() or "—"
        plate_disp = "ÇEKME KARAVAN (plakasız)" if is_trailer else (svc.get("plate") or "—")
        info_label = ParagraphStyle('SvcInfoLabel', parent=self.styles['Normal'], fontName=self.get_font_name(is_bold=True), fontSize=7, textColor=colors.HexColor('#64748B'), leading=9)
        info_val = ParagraphStyle('SvcInfoVal', parent=self.styles['Normal'], fontName=self.get_font_name(is_bold=True), fontSize=9.5, textColor=colors.HexColor('#1B3A5C'), leading=12)
        def info_cell(label, value):
            return [Paragraph(label.upper(), info_label), Paragraph(upper_tr(str(value)), info_val)]
        info_tbl = PDFTable([[
            info_cell("Telefon", svc.get("phone") or "—"), info_cell("Araç", vehicle),
            info_cell("Plaka", plate_disp), info_cell("Teslim Tarihi", _fmt_date(svc.get("delivery_date"))),
        ]], colWidths=[4.5*cm, 4.5*cm, 4.5*cm, 4.5*cm])
        info_tbl.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F4F6F9')),
            ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#D9E0E8')),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#E5EAF0')),
            ('TOPPADDING', (0,0), (-1,-1), 9), ('BOTTOMPADDING', (0,0), (-1,-1), 9),
            ('LEFTPADDING', (0,0), (-1,-1), 10), ('RIGHTPADDING', (0,0), (-1,-1), 10),
        ]))
        story.append(info_tbl)
        story.append(Spacer(1, 14))

        # ---- Parça / İşlem kalemleri tablosu ----
        items = svc.get("items") or []
        if items:
            rows = [[
                Paragraph("<b>#</b>", self.table_header_center_style),
                Paragraph("<b>PARÇA / İŞLEM</b>", self.table_header_style),
                Paragraph("<b>ADET</b>", self.table_header_center_style),
                Paragraph("<b>BİRİM (₺)</b>", self.table_header_right_style),
                Paragraph("<b>TUTAR (₺)</b>", self.table_header_right_style),
            ]]
            tstyles = [
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1B3A5C')),
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('LINEBELOW', (0,0), (-1,-1), 0.5, colors.HexColor('#CBD5E1')),
                ('TOPPADDING', (0,0), (-1,-1), 5), ('BOTTOMPADDING', (0,0), (-1,-1), 5),
                ('LEFTPADDING', (0,0), (-1,-1), 6), ('RIGHTPADDING', (0,0), (-1,-1), 6),
                ('ALIGN', (2,0), (2,-1), 'CENTER'), ('ALIGN', (3,0), (-1,-1), 'RIGHT'),
            ]
            for i, it in enumerate(items):
                qty = float(it.get("qty") or 0)
                unit = float(it.get("unit_price") or 0)
                rows.append([
                    Paragraph(str(i+1), self.table_cell_style),
                    Paragraph(upper_tr(it.get("name") or ""), self.table_cell_style),
                    Paragraph(f"{qty:g}", self.table_cell_right),
                    Paragraph(fmt(unit), self.table_cell_right),
                    Paragraph(fmt(qty*unit), self.table_cell_right_bold),
                ])
            items_tbl = PDFTable(rows, colWidths=[0.9*cm, 9.6*cm, 1.8*cm, 2.85*cm, 2.85*cm])
            items_tbl.setStyle(TableStyle(tstyles))
            story.append(items_tbl)
            story.append(Spacer(1, 12))

        # ---- Ödeme özeti (Toplam / Avans / Kalan) ----
        total = svc.get("cost")
        if total is None:
            total = _service_items_total(items)
        total = float(total or 0)
        advance = float(svc.get("advance_amount") or 0)
        remaining = max(total - advance, 0)
        pay_label = ParagraphStyle('SvcPayLbl', parent=self.styles['Normal'], fontName=self.get_font_name(is_bold=True), fontSize=9, textColor=colors.HexColor('#475569'), alignment=TA_LEFT, leading=12)
        pay_val = ParagraphStyle('SvcPayVal', parent=self.styles['Normal'], fontName=self.get_font_name(is_bold=True), fontSize=11, textColor=colors.HexColor('#1B3A5C'), alignment=TA_RIGHT, leading=14)
        pay_rows = [
            [Paragraph("Toplam Tutar", pay_label), Paragraph(fmt(total), pay_val)],
            [Paragraph("Alınan Avans", pay_label), Paragraph(fmt(advance), pay_val)],
        ]
        pay_tbl = PDFTable(pay_rows, colWidths=[9.0*cm, 9.0*cm])
        pay_tbl.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('LINEBELOW', (0,0), (-1,-1), 0.5, colors.HexColor('#E5EAF0')),
            ('TOPPADDING', (0,0), (-1,-1), 7), ('BOTTOMPADDING', (0,0), (-1,-1), 7),
            ('LEFTPADDING', (0,0), (-1,-1), 14), ('RIGHTPADDING', (0,0), (-1,-1), 14),
        ]))
        remaining_left = [Paragraph("KALAN TUTAR", self.gt_label_style), Paragraph("Teslimde tahsil edilecek", self.gt_sub_style)]
        remaining_right = [Paragraph(f"<b>{fmt(remaining)}</b>", self.gt_amount_style)]
        rem_tbl = PDFTable([[remaining_left, remaining_right]], colWidths=[8.3*cm, 9.7*cm])
        rem_tbl.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,-1), 14), ('BOTTOMPADDING', (0,0), (-1,-1), 14),
            ('LEFTPADDING', (0,0), (0,-1), 18), ('LEFTPADDING', (1,0), (1,-1), 0),
            ('RIGHTPADDING', (0,0), (0,-1), 8), ('RIGHTPADDING', (1,0), (1,-1), 18),
            ('LINEBEFORE', (0,0), (0,-1), 4, colors.HexColor('#10B981')),
        ]))
        story.append(pay_tbl)
        story.append(Spacer(1, 8))
        story.append(RoundedCard([rem_tbl], width=18.0*cm, bg_color=colors.HexColor('#1B3A5C'), corner_radius=8, padding=0))
        story.append(Spacer(1, 14))

        # ---- Garanti ----
        wm = svc.get("warranty_months")
        if wm or svc.get("warranty_note"):
            w_lines = []
            if wm:
                end_txt = ""
                if svc.get("delivery_date"):
                    try:
                        d0 = datetime.fromisoformat(str(svc["delivery_date"]).replace('Z', '+00:00'))
                        month = d0.month - 1 + int(wm)
                        year = d0.year + month // 12
                        end = d0.replace(year=year, month=month % 12 + 1, day=min(d0.day, 28))
                        end_txt = f" (Bitiş: {end.strftime('%d.%m.%Y')})"
                    except Exception:
                        end_txt = ""
                w_lines.append(f"<b>Garanti Süresi:</b> {int(wm)} ay{end_txt}")
            if svc.get("warranty_note"):
                w_lines.append(upper_tr(svc.get("warranty_note")))
            w_flow = [Paragraph("<b>GARANTİ</b>", self.note_title_style)] + [Paragraph(t, self.note_text_style) for t in w_lines]
            w_tbl = PDFTable([[w_flow]], colWidths=[18.0*cm])
            w_tbl.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#FEF3C7')),
                ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#FDE68A')),
                ('TOPPADDING', (0,0), (-1,-1), 10), ('BOTTOMPADDING', (0,0), (-1,-1), 10),
                ('LEFTPADDING', (0,0), (-1,-1), 12), ('RIGHTPADDING', (0,0), (-1,-1), 12),
            ]))
            story.append(RoundedCard([w_tbl], width=18.0*cm, bg_color=colors.HexColor('#FEF3C7'), border_color=colors.HexColor('#FDE68A'), border_width=0.5, corner_radius=8, padding=0))
            story.append(Spacer(1, 14))

        # ---- Yapılan işlemler / notlar ----
        body_txt = []
        if svc.get("operations"):
            body_txt.append(Paragraph("<b>YAPILAN İŞLEMLER</b>", self.note_title_style))
            for line in str(svc["operations"]).split("\n"):
                if line.strip():
                    body_txt.append(Paragraph(upper_tr(line), self.note_text_style))
        if svc.get("notes"):
            if body_txt:
                body_txt.append(Spacer(1, 6))
            body_txt.append(Paragraph("<b>NOTLAR</b>", self.note_title_style))
            for line in str(svc["notes"]).split("\n"):
                if line.strip():
                    body_txt.append(Paragraph(upper_tr(line), self.note_text_style))
        if body_txt:
            n_tbl = PDFTable([[body_txt]], colWidths=[18.0*cm])
            n_tbl.setStyle(TableStyle([
                ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F4F6F9')),
                ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#D9E0E8')),
                ('TOPPADDING', (0,0), (-1,-1), 10), ('BOTTOMPADDING', (0,0), (-1,-1), 10),
                ('LEFTPADDING', (0,0), (-1,-1), 12), ('RIGHTPADDING', (0,0), (-1,-1), 12),
            ]))
            story.append(n_tbl)
            story.append(Spacer(1, 18))

        # ---- İmza ----
        sig_style = ParagraphStyle('SvcSig', parent=self.styles['Normal'], fontName=self.get_font_name(is_bold=True), fontSize=9, textColor=colors.HexColor('#1B3A5C'), alignment=TA_CENTER)
        sig_sub = ParagraphStyle('SvcSigSub', parent=self.styles['Normal'], fontName=self.get_font_name(), fontSize=8, textColor=colors.HexColor('#94A3B8'), alignment=TA_CENTER, spaceBefore=22)
        sig_tbl = PDFTable([[
            [Paragraph("Çorlu Karavan", sig_style), Paragraph("Yetkili İmza", sig_sub)],
            [Paragraph(upper_tr(cust or "Müşteri"), sig_style), Paragraph("Müşteri İmza", sig_sub)],
        ]], colWidths=[9.0*cm, 9.0*cm])
        sig_tbl.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('TOPPADDING', (0,0), (-1,-1), 10), ('LEFTPADDING', (0,0), (-1,-1), 20), ('RIGHTPADDING', (0,0), (-1,-1), 20),
        ]))
        story.append(sig_tbl)

        doc.build(story, onFirstPage=self._draw_page_decorations, onLaterPages=self._draw_page_decorations)
        buffer.seek(0)
        return buffer


@api_router.get("/services/{service_id}/pdf")
async def download_service_pdf(service_id: str):
    """Servis / iş emri teslim formunu PDF olarak indir."""
    try:
        svc = await db.services.find_one({"id": service_id})
        if not svc:
            raise HTTPException(status_code=404, detail="Servis kaydı bulunamadı")
        svc.pop("_id", None)
        pdf_buffer = PDFServiceGenerator().create_service_pdf(svc)
        raw = (svc.get("order_no") or "servis-formu")
        ascii_name = raw.encode("ascii", "ignore").decode("ascii").strip() or "servis-formu"
        return StreamingResponse(
            pdf_buffer, media_type='application/pdf',
            headers={"Content-Disposition": f'attachment; filename="{ascii_name}.pdf"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Servis PDF üretim hatası: {e}")
        raise HTTPException(status_code=500, detail="PDF üretilirken hata oluştu")


@app.get("/api/contracts/{contract_id}/pdf")
async def download_contract_pdf(contract_id: str):
    """Sözleşmeyi tasarımlı PDF olarak indir."""
    try:
        doc = await db.contracts.find_one({"id": contract_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Sözleşme bulunamadı")
        
        # Eğer düzenlenmiş data henüz yoksa (Excel ham haldeyse) önce parse et
        if not doc.get("data") or not doc["data"].get("sections"):
            sheets = doc.get("sheets") or []
            parsed_data = parse_contract_data(sheets)
            if parsed_data:
                await db.contracts.update_one({"id": contract_id}, {"$set": {"data": parsed_data}})
                doc["data"] = parsed_data
                
        if not doc.get("data"):
            raise HTTPException(status_code=422, detail="Sözleşme verisi PDF için ayrıştırılamadı.")
            
        pdf_generator = PDFContractGenerator()
        pdf_buffer = pdf_generator.create_contract_pdf(doc)
        
        raw_name = (doc.get("title") or "sozlesme") + ".pdf"
        ascii_name = raw_name.encode("ascii", "ignore").decode("ascii") or "sozlesme.pdf"
        if not ascii_name.lower().endswith(".pdf"):
            ascii_name += ".pdf"
            
        return StreamingResponse(
            pdf_buffer,
            media_type='application/pdf',
            headers={"Content-Disposition": f'attachment; filename="{ascii_name}"'}
        )
    except Exception as e:
        logger.error(f"Sözleşme PDF üretim hatası: {e}")
        raise HTTPException(status_code=500, detail="PDF üretilirken hata oluştu")


app.include_router(api_router)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)