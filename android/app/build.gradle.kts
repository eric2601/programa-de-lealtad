plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "mx.lealtad.gasolineras"
    compileSdk = 35

    defaultConfig {
        applicationId = "mx.lealtad.gasolineras"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        // URL de la API. 10.0.2.2 es el localhost de la máquina vista desde el emulador.
        // Para un teléfono físico en la misma red: -Plealtad.baseUrl=http://192.168.x.x:8787
        val baseUrl = (project.findProperty("lealtad.baseUrl") as String?)
            ?: System.getenv("LEALTAD_BASE_URL")
            ?: "http://10.0.2.2:8787"
        buildConfigField("String", "BASE_URL", "\"$baseUrl\"")

        // Solo procesadores ARM (teléfonos y terminales reales). Quita ~23 MB del lector de placas
        // para emuladores x86. La terminal Verifone es armeabi-v7a.
        ndk { abiFilters += listOf("armeabi-v7a", "arm64-v8a") }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}

dependencies {
    implementation(project(":core"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.kotlinx.coroutines.android)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
}
