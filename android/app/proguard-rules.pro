# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class mx.lealtad.gasolineras.**$$serializer { *; }
-keepclassmembers class mx.lealtad.gasolineras.** { *** Companion; }
-keepclasseswithmembers class mx.lealtad.gasolineras.** { kotlinx.serialization.KSerializer serializer(...); }
