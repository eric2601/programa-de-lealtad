# kotlinx.serialization: conservar los serializadores generados de los modelos de la API.
-keepclassmembers class mx.lealtad.core.data.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class mx.lealtad.core.data.**$$serializer { *; }
