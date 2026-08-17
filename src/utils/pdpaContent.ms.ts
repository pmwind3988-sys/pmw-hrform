/**
 * Verbatim text of "PMW INTERNATIONAL BERHAD - NOTIS PRIVASI", document
 * reference "Notis Privasi 020126" (Bahasa Malaysia) — the same revision as the
 * English rendition in `pdpaContent.en.ts`. Section 7(3) of Act 709 requires the
 * notice to be issued in both the national language and English, so the two
 * files must always be updated together.
 *
 * Clause numbering follows the Malay source, which differs from the English in
 * two places: clause A has no separate lead paragraph number difference, and
 * clause L is numbered "1." where the English is an unnumbered paragraph.
 *
 * Do not reword or summarise — this is legal wording, not app copy.
 */
import type { PdpaNoticeContent } from "./pdpaTypes";

export const PDPA_CONTENT_MS: PdpaNoticeContent = {
  locale: "ms",

  preamble:
    'PMW International Berhad, subsidiari, syarikat-syarikat bersekutu, entiti yang dikawal bersama dan gabungannya (termasuk tetapi tidak terhad kepada PMW International dan PMW International Berhad bersekutu, entiti yang dikawal bersama dan gabungannya dan mana-mana syarikat dimana anda telah/akan ditukarkan sementara ("seconded")/dipindahkan (secara kolektifnya "Kumpulan"), menghormati privasi individu berkenaan data peribadi. Notis Privasi ini dirumuskan menurut Akta Perlindungan Data Peribadi 2010 ("Akta"). Untuk tujuan Notis Privasi ini, "Data Peribadi" hendaklah mempunyai erti yang dianggap kepadanya dalam Akta dan terma "kami" akan merujuk kepada mana-mana syarikat dalam Kumpulan dan "anda" akan merujuk kepada diri anda sendiri dan/atau mana-mana individu yang anda mewakili di mana anda memberi "Data Peribadi".',

  summary:
    "Data Peribadi anda dikumpul, disimpan dan digunakan oleh Kumpulan bagi tujuan sumber manusia, perekrutan, program, operasi, undang-undang dan regulatori, dan mungkin didedahkan serta dipindahkan dalam Kumpulan dan kepada pihak ketiga seperti yang dinyatakan dalam Notis Privasi.",

  retentionSummary:
    "Data Peribadi disimpan dalam salinan cetak di pejabat-pejabat Kumpulan atau di dalam server di dalam atau di luar Malaysia, dan akan disimpan selama yang diperlukan bagi memenuhi tujuan yang dinyatakan dalam Notis Privasi atau untuk memenuhi keperluan undang-undang, regulatori dan perakaunan, atau untuk melindungi kepentingan Kumpulan.",

  consentLabel:
    "Saya telah membaca dan memahami Notis Privasi PMW International Berhad, dan saya bersetuju Kumpulan mengumpul, menyimpan, menggunakan, mendedahkan dan memindahkan Data Peribadi saya bagi tujuan yang dinyatakan di dalamnya.",

  thirdPartyConfirmation:
    "Sekiranya anda memberikan Data Peribadi mengenai orang lain, termasuk referi anda, anda mengesahkan bahawa anda telah mendapatkan kebenaran mereka untuk Data Peribadi tersebut digunakan dan didedahkan kepada Kumpulan menurut Notis Privasi ini.",

  contactEntity: "PMW International Berhad dan/atau Kumpulan",
  personInCharge: "Ketua Pegawai Sumber Manusia",

  ui: {
    languageName: "Bahasa Malaysia",
    documentTitle: "Notis Privasi",
    eyebrow: "Notis Privasi PDPA",
    versionLabel: (version) => `Versi notis ${version}`,
    back: "Kembali",
    returnHome: "Kembali ke Laman Utama",
    addressLabel: "Alamat",
    personInChargeLabel: "Wakil",
    emailLabel: "Email",
    telLabel: "Tel No.",
    viewNotice: "Lihat Notis Privasi",
    consentRequired: "Persetujuan diperlukan sebelum penghantaran.",
    footer:
      "Sebarang pertanyaan, permohonan akses, permohonan pembetulan, atau penarikan balik persetujuan boleh dihantar ke alamat di atas. Notis ini hendaklah dibaca bersama-sama dengan arahan khusus borang yang dipaparkan sebelum penghantaran.",
    consentRecordNote: (version) =>
      `Versi notis ${version}. Rekod persetujuan anda disimpan bersama permohonan ini.`,
  },

  sections: [
    {
      id: "A",
      title: "Maklumat Yang Dikumpulkan",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: 'Data Peribadi mengenai anda yang dikumpul oleh kami melalui cetak dan platform digital (termasuk tetapi tidak terhad kepada laman web, portal dalam talian, media sosial dan aplikasi mudah alih ("Portal Kumpulan")) termasuk:',
              items: [
                {
                  marker: "alpha",
                  text: "maklumat yang dikumpul apabila anda mendaftar atau mengemaskini maklumat anda dengan kami, yang mungkin termasuk data peribadi seperti gambar, nama, butir-butir hubungan, umur, status perkahwinan, bangsa atau keturunan etnik, kebolehpercayaan kredit, kesihatan fizikal atau mental atau keadaan perubatan, pilihan pemakanan dan/atau perlakuan atau pertuduhan melakukan apa-apa kesalahan atau prosiding bagi apa-apa kesalahan yang telah dilakukan termasuk salah laku masa lampau, pelupusan prosiding tersebut atau hukuman dari mana-mana mahkamah dalam prosiding tersebut;",
                },
                {
                  marker: "alpha",
                  text: "isi kandungan kesemua borang bercetak dan elektronik atau dokumen-dokumen yang dikemukakan kepada kami melalui cagaran bercetak atau borang-borang dan melalui Portal Kumpulan, termasuk dokumen-dokumen pengenalan dan bukti alamat serta isi kandungan apa-apa video yang dikemukakan;",
                },
                {
                  marker: "alpha",
                  text: "maklumat yang dimasukkan atau diserahkan ke dalam kemudahan dalam talian seperti alat carian dan kalkulator (jika ada);",
                },
                {
                  marker: "alpha",
                  text: "personalisasi utama yang anda pilih semasa anda menggunakan Portal Kumpulan;",
                },
                {
                  marker: "alpha",
                  text: "maklumat yang dikemukakan jika anda mengambil bahagian dalam tinjauan sama ada melalui dalam talian atau sebaliknya;",
                },
                {
                  marker: "alpha",
                  text: "apa-apa mesej atau komen yang anda serahkan kepada kami dalam apa jua bentuk, yang mungkin termasuk data peribadi seperti nama, alamat e-mel dan nombor telefon;",
                },
                {
                  marker: "alpha",
                  text: "maklumat yang didapati secara bebas oleh Kumpulan dari sumber-sumber yang sah;",
                },
                {
                  marker: "alpha",
                  text: "maklumat yang diperlukan dalam menjalankan aktiviti perniagaan Kumpulan yang berkaitan; dan",
                },
                {
                  marker: "alpha",
                  text: "isi kandungan kesemua borang dan/atau dokumen yang dikemukakan dan/atau yang dikumpul oleh Kumpulan.",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "B",
      title: "Tujuan Mengumpul Data Peribadi",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "Dengan memberikan apa-apa Data Peribadi anda kepada Kumpulan, anda dengan ini membenarkan Kumpulan mengumpul, menyimpan dan menggunakan Data Peribadi bagi tujuan-tujuan berikut:",
              items: [
                {
                  marker: "alpha",
                  text: "memberikan anda dengan perkhidmatan atau manfaat di bawah mana-mana perniagaan dan/atau polisi Kumpulan dan/atau untuk apa-apa tujuan sumber manusia termasuk tetapi tidak terhad kepada:",
                  items: [
                    { marker: "roman", text: "menilai prestasi kerja, kehadiran dan rekod disiplin individu;" },
                    { marker: "roman", text: "menjalankan prosiding disiplin pekerja;" },
                    { marker: "roman", text: "menjalankan latihan bagi pekerja;" },
                    {
                      marker: "roman",
                      text: "mendapatkan dan menyimpan rekod kesihatan pekerja dan maklumat termasuk yang memerlukan anda membekalkan rekod kesihatan, melengkapkan borang soal selidik perubatan dan/atau menjalani pemeriksaan perubatan;",
                    },
                    { marker: "roman", text: "menyemak semula gaji, bonus dan manfaat lain;" },
                    {
                      marker: "roman",
                      text: "memberikan rujukan pekerja yang termasuk: surat kepada pihak ketiga dengan memberikan butiran pekerjaan pekerja (tidak termasuk maklumat gaji) dengan Kumpulan;",
                    },
                    {
                      marker: "roman",
                      text: "memantau komunikasi perniagaan (termasuk, tetapi tidak terhad kepada komunikasi melalui telefon dan e-mel) untuk tujuan yang termasuk: memberikan keterangan transaksi perniagaan; memastikan prosedur perniagaan, dasar dan kontrak dengan pekerja dipatuhi; mematuhi apa-apa obligasi undang-undang; memantau piawaian perkhidmatan, prestasi kakitangan dan untuk latihan kakitangan; dan",
                    },
                    {
                      marker: "roman",
                      text: "semua perkara lain yang berkaitan dengan pekerjaan anda dengan Kumpulan sepertimana yang Kumpulan fikirkan perlu atau sesuai; dan/atau",
                    },
                  ],
                },
                {
                  marker: "alpha",
                  text: "memproses permohonan anda di bawah mana-mana program Kumpulan; dan/atau",
                },
                {
                  marker: "alpha",
                  text: "jika berkenaan, pemasaran barangan dan perkhidmatan dan menghantar apa-apa pengemaskinian, produk baru, tawaran khas, pengiklanan, bahan promosi dan/atau bahan komersial kepada anda (termasuk e-mel, khidmat pesanan ringkas atau apa jua cara lain) dan/atau untuk digunakan, untuk memberi dan/atau memperbaiki perkhidmatan Kumpulan dan memberi perkhidmatan lain untuk meningkatkan dan menyokong hubungan Kumpulan dengan anda dan/atau mana-mana orang lain yang diwakili oleh anda; dan/atau",
                },
                {
                  marker: "alpha",
                  text: "menjalankan penyelidikan mengenai perancangan, produk, barangan, perkhidmatan, keselamatan dan ujian; dan/atau",
                },
                { marker: "alpha", text: "menjalankan prosedur padanan menurut undang-undang; dan/atau" },
                {
                  marker: "alpha",
                  text: "melaksanakan statistik analisa untuk pelbagai objektif di dalam Kumpulan dan memberikan maklumat ini kepada Kumpulan; dan/atau",
                },
                {
                  marker: "alpha",
                  text: "di mana anda telah memberikan resume anda, mempertimbangkan anda untuk apa-apa pekerjaan yang mungkin wujud dalam Kumpulan; dan/atau",
                },
                {
                  marker: "alpha",
                  text: "tujuan yang berkaitan dengan operasi, pentadbiran, pembangunan, atau penambahbaikkan perniagaan Kumpulan termasuk untuk tujuan yang berkenaan untuk menyokong dan/atau membantu mana-mana perniagaan Kumpulan (sebagai contoh, memberikan maklumat berkenaan anda dan mengenai pengalaman pekerjaan anda untuk memenuhi maklumat yang diperlukan bagi pengajuan tender untuk projek atau untuk memenuhi keperluan regulatori); dan/atau",
                },
                {
                  marker: "alpha",
                  text: "setakat mana dikehendaki oleh undang-undang, di mana Kumpulan menganggap bahawa penggunaan atau pendedahan sedemikian adalah perlu untuk bertindak balas terhadap apa-apa tuntutan atau proses undang-undang, atau di mana Kumpulan mengesyaki telah, sedang atau mungkin akan terlibat dalam penipuan atau aktiviti yang menyalahi undang-undang; dan/atau",
                },
                {
                  marker: "alpha",
                  text: "di mana pihak ketiga memperolehi atau ingin memperolehi, atau membuat pertanyaan berkaitan dengan memperolehi, suatu kepentingan dalam mana-mana syarikat dalam Kumpulan; dan/atau",
                },
                {
                  marker: "alpha",
                  text: "di mana pihak ketiga memerlukannya untuk pihak ketiga tersebut menjalankan fungsi atau perkhidmatan yang diminta oleh Kumpulan (sebagai contoh, kepada syarikat insurans yang mengaturkan polisi nyawa/insurans Kumpulan dan kepada bank yang mengaturkan bayaran gaji (untuk pekerja) dan kepada bank yang mengaturkan bayaran biasiswa dan kos sara hidup (untuk pemegang biasiswa); dan/atau",
                },
                {
                  marker: "alpha",
                  text: "di mana pihak ketiga memerlukannya untuk pihak ketiga tersebut menjalankan fungsi atau obligasinya sepertimana yang diperuntukkan dibawah undang-undang, peraturan, undang-undang kecil dan/atau garis panduan (sama ada mempunyai kuasa undang-undang atau sebaliknya) atau sepertimana yang diperlukan oleh mana-mana badan berkuasa kerajaan atau bukan kerajaan, agensi atau jabatan (sebagai contoh, kepada pengaudit luaran yang sedang mengauditkan bahagian sumber manusia dan bahagian pendidikan/latihan Kumpulan) atau di mana pihak ketiga memerlukannya untuk memastikan pelaksanaan mana-mana terma-terma perjanjian ataupun dokumen; dan/atau",
                },
                {
                  marker: "alpha",
                  text: "di mana pihak ketiga memerlukannya untuk menyediakan dan menyerahkan mana-mana tuntutan atau bayaran kepada mana-mana pihak atau untuk audit/pemeriksaan oleh mana-mana pihak untuk apa-apa tujuan yang berkaitan dengan perniagaan Kumpulan; dan/atau",
                },
                {
                  marker: "alpha",
                  text: "tujuan yang berkaitan dengan penguatkuasaan hak Kumpulan mengikut mana-mana surat, perjanjian dan/atau dokumen termasuk mendapatkan nasihat undang-undang dan nasihat kewangan, mengambil langkah-langkah awal atau memulakan apa-apa tindakan undang-undang; dan/atau",
                },
                {
                  marker: "alpha",
                  text: "jika anda memohon sebagai seorang pelatih atau dilantik sebagai seorang pelatih, selain daripada tujuan seperti yang dinyatakan disini, untuk mempertimbangkan dan menilaikan kelayakan anda dan jikalau anda berjaya, untuk penyediaan dan tandatangan perjanjian dan dokumen yang relevan serta pentadbiran pelantikan anda sebagai pelatih; dan/atau",
                },
                {
                  marker: "alpha",
                  text: "untuk apa-apa tujuan yang berkenaan atau secara sampingan atau untuk melanjutkan tujuan Kumpulan; dan/atau",
                },
                {
                  marker: "alpha",
                  text: "membuat pendedahan sedemikian sebagaimana yang dikehendaki bagi mana-mana tujuan di atas atau undang-undang.",
                },
              ],
            },
            {
              text: "Kami boleh menghubungi anda untuk tujuan seperti yang dinyatakan di dalam (B) di atas sama ada melalui panggilan telefon, e-mel, khidmat pesanan ringkas, media sosial, pos, faksimili atau melalui apa jua cara komunikasi yang sedia ada.",
            },
          ],
        },
      ],
    },
    {
      id: "C",
      title: "Penggunaan Dan Pendedahan",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: 'Anda selanjutnya bersetuju bahawa Kumpulan boleh mendedahkan dan memindahkan (sama ada di Malaysia atau luar negara) di antara mana-mana syarikat dalam Kumpulan dan/atau kepada pihak ketiga termasuk tetapi tidak terhad kepada institusi pendidikan dan penilai luaran ("external") untuk biasiswa atau kepada mana-mana syarikat dimana anda telah/akan ditukarkan sementara ("seconded")/dipindahkan, ejen, konsultan, peguam, pengaudit, majikan, kontraktor, pembekal, rakan kongsi, ahli gabungan bersama, pembeli, pengendali rangkaian, syarikat-syarikat bersekutu, mana-mana pihak authoriti yang relevan (kerajaan dan/atau bukan kerajaan), kedutaan, badan statutori, badan regulatori, organisasi dan/atau mana-mana institusi kewangan berkenaan, mana-mana orang lain dibawah kewajipan kerahsiaan terhadap Kumpulan atau mana-mana syarikat di dalam Kumpulan (termasuk yang ditubuhkan atau diperbadankan dari masa ke semasa), mana-mana referi yang butir-butirnya diberikan oleh anda, mana-mana syarikat di dalam Kumpulan, pemegang serah hak atau penerima pindahan atau pembeli hak/perniagaan/aset syarikat dalam Kumpulan sama ada sebenar atau yang dicadangkan, pembekal perkhidmatan (termasuk mereka yang membantu kami dalam penyediaan/pembangunan/penyelenggaraan Portal Kumpulan), bagi keperluan operasi, pentadbiran dan pembangunan Kumpulan dan kepada organisasi-organisasi yang membekalkan perkhidmatan arkib, pengauditan, nasihat profesional, pungutan hutang, insurans, perbankan, penghantaran, perekrutan, pusat panggilan, teknologi, penyelidikan, utiliti dan perkhidmatan keselamatan untuk menggunakan, mendedahkan, memegang, memproses, menyimpan atau memindahkan Data Peribadi itu bagi tujuan (B) di atas untuk dan bagi pihak Kumpulan.',
            },
            {
              text: "Kumpulan menggunakan dan mendedahkan maklumat yang bukan mengenalpasti secara peribadi yang telah dikumpulkan oleh kami sebagai sebahagian daripada proses Kumpulan untuk sentiasa memperbaiki Portal Kumpulan dan/atau perniagaan Kumpulan.",
            },
          ],
        },
      ],
    },
    {
      id: "D",
      title: "Kesan Ketiadaan Peruntukan Data Peribadi",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "Sila ambil perhatian bahawa sekiranya Data Peribadi yang dibekalkan tidak mencukupi, atau tidak memuaskan kepada Kumpulan, maka permohonan atau permintaan anda kepada Kumpulan bagi apa-apa tujuan seperti yang dinyatakan dalam (B) di atas mungkin tidak boleh diterima atau bertindak keatasnya atau Kumpulan tidak akan dapat memberikan pelbagai jenis manfaat dan/atau perkhidmatan dan/atau melaksanakan obligasinya dibawah apa-apa kontrak yang bakal ditandatangani ataupun kontrak yang sedia ada.",
            },
          ],
        },
      ],
    },
    {
      id: "E",
      title: "Penyimpanan Dan Pengekalan Data Peribadi",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "Data Peribadi anda akan disimpan sama ada dalam salinan cetak di pejabat-pejabat Kumpulan atau disimpan di dalam server yang terletak di dalam atau di luar Malaysia dan dikendalikan oleh Kumpulan atau pembekal perkhidmatannya di dalam atau di luar Malaysia.",
            },
            {
              text: "Sebarang Data Peribadi yang dibekalkan oleh anda akan disimpan oleh Kumpulan selama yang diperlukan bagi memenuhi tujuan yang dinyatakan dalam (B) di atas atau diperlukan untuk memenuhi mana-mana keperluan undang-undang, regulatori dan/atau keperluan perakaunan atau untuk melindungi kepentingan Kumpulan.",
            },
            {
              text: "Kumpulan tidak menawarkan sebarang kemudahan dalam talian bagi anda untuk memadamkan Data Peribadi yang dipegang oleh Kumpulan.",
            },
          ],
        },
      ],
    },
    {
      id: "F",
      title: "Pemohon-Pemohon Pekerjaan",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "Data Peribadi yang diberikan berkaitan dengan permohonan untuk pekerjaan akan digunakan untuk menentukan kesesuaian anda bagi suatu jawatan dalam Kumpulan dan, sekiranya berkenaan, terma-terma pekerjaan atau pelantikan anda.",
            },
            {
              text: "Anda dengan ini mengesahkan bahawa anda telah mendapatkan persetujuan dari referi(-referi) anda untuk penggunaan dan pendedahan Data Peribadi referi(-referi) anda kepada Kumpulan dan Kumpulan berhak mengunakan Data Peribadi referi(-referi) anda mengikut Notis Privasi ini.",
            },
            {
              text: "Data Peribadi anda juga boleh digunakan untuk memantau daya usaha perekrutan dan dasar-dasar peluang yang sama Kumpulan.",
            },
            {
              text: "Butir-butir Data Peribadi anda mungkin didedahkan kepada pihak ketiga untuk mengesahkan atau mendapat maklumat tambahan termasuk institusi pendidikan, majikan kini/sebelumnya dan agensi rujukan kredit.",
            },
            {
              text: "Permohonan tidak berjaya mungkin disimpan untuk peluang pekerjaan yang sepadan dengan kemahiran anda pada masa akan datang.",
            },
          ],
        },
      ],
    },
    {
      id: "G",
      title: "Kerahsiaan",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "Data Peribadi yang dipegang oleh Kumpulan akan dirahsiakan menurut Notis Privasi ini selaras dengan mana-mana undang-undang terpakai yang berkuatkuasa dari semasa ke semasa.",
            },
            {
              text: "Sebarang pertanyaan, komen, cadangan atau maklumat selain daripada Data Peribadi yang diserahkan kepada kami dalam apa jua carapun akan dianggap diberi kepada Kumpulan secara sukarela atas dasar tidak sulit dan tidak dimiliki.",
            },
            {
              text: "Kumpulan berhak untuk menggunakan, mengeluarkan semula, mendedahkan, menghantarkan, menerbitkan, menyiarkan dan/atau mengeposkan tempat lain maklumat tersebut secara bebas seperti yang dinyatakan dalam (C) di atas.",
            },
          ],
        },
      ],
    },
    {
      id: "H",
      title: "Keselamatan Data Peribadi",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "Kumpulan menggunakan beberapa mekanisme untuk melindungi keselamatan dan integriti Data Peribadi anda.",
            },
            {
              text: "Nama pengguna dan kata laluan mungkin mustahak untuk anda menggunakan beberapa bahagian dalam Portal Kumpulan. Untuk perlindungan anda sendiri, Kumpulan memerlukan anda untuk merahsiakan dan menukar kata laluan anda secara kerap (jika perlu).",
            },
          ],
        },
      ],
    },
    {
      id: "I",
      title: "Pemindahan Data Peribadi",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "Disebabkan dasar globasasi perniagaan Kumpulan, Kumpulan mungkin memindahkan Data Peribadi anda kepada ahli-ahli lain dalam Kumpulan (yang mungkin berada di luar negara) atau kepada mana-mana pihak yang berada di luar negara (termasuk negara yang mempunyai regim perlindungan data peribadi yang berbeza daripada negara dimana anda berada). Apa-apa Data Peribadi yang dipindahkan akan digunakan bagi tujuan seperti yang dinyatakan dalam (B) di atas dan didedahkan kepada pihak-pihak yang dinyatakan di dalam (C) di atas.",
            },
          ],
        },
      ],
    },
    {
      id: "J",
      title: "Hak Akses Kepada Data Peribadi",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "Di bawah Akta, anda mempunyai hak akses kepada Data Peribadi anda yang dipegang oleh Kumpulan dan anda boleh memohon Kumpulan untuk membetulkan mana-mana Data Peribadi anda yang tidak tepat, tidak lengkap atau tidak dikemaskinikan, tertakluk kepada sebarang sekatan di bawah undang-undang serta syarat-syarat kontrak/pekerjaan.",
            },
            {
              text: "Jika anda mempunyai sebarang pertanyaan mengenai Notis Privasi ini atau jika anda ingin memohon akses kepada Data Peribadi anda atau jika anda ingin membetulkan Data Peribadi anda atau jika anda ingin menarik balik kebenaran anda kepada Kumpulan bagi pemprosesan Data Peribadi anda bagi tujuan seperti yang dinyatakan dalam (B) di atas atau untuk pemindahan Data Peribadi anda kepada pihak-pihak yang dinyatakan dalam (C) di atas, anda boleh menghantar permohonan anda secara bertulis ke alamat berikut:",
            },
          ],
        },
        { kind: "contact" },
        {
          kind: "text",
          text: "Sila ambil perhatian bahawa walaupun anda menarik balik persetujuan anda, Kumpulan masih boleh terus memproses Data Peribadi anda di bawah keadaan-keadaan yang diiktiraf dan dibenarkan oleh undang-undang dan seperti yang diperlukan di bawah syarat-syarat kontrak/pekerjaan.",
        },
      ],
    },
    {
      id: "K",
      title: "Data Peribadi Yang Diberikan Oleh Anda",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "Anda mengesahkan bahawa anda telah mendapatkan kebenaran daripada orang yang mana anda memberikan Data Peribadi mereka kepada kami untuk tujuan seperti yang dinyatakan dalam (B) di atas dan didedahkan kepada pihak yang dinyatakan di dalam (C) di atas.",
            },
            {
              text: "Anda bertanggungjawab untuk memberikan kepada kami Data Peribadi yang tepat, lengkap dan terkini berkenaan Data Peribadi anda dan/atau Data Peribadi orang lain yang anda kemukakan kepada kami. Oleh itu, apabila Data Peribadi tersebut menjadi tidak tepat, tidak lengkap atau tidak kemaskini, anda perlu membetulkan atau mengemaskinikan Data Peribadi tersebut dengan menghubungi kami atau mengemukakan Data Peribadi terkini kepada kami secara bertulis seperti yang dinyatakan dalam (J) di atas.",
            },
          ],
        },
      ],
    },
    {
      id: "L",
      title: "Pengubahan Kepada Notis Privasi",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "Kumpulan berhak untuk mengubahsuai, mengemaskini dan/atau meminda Notis Privasi ini dari semasa ke semasa tanpa memberi notis terlebih dahulu. Kumpulan menasihatkan supaya anda menyemak Notis Privasi ini di laman web Kumpulan kami secara kerap.",
            },
          ],
        },
      ],
    },
  ],

  additionalTermsIntro: "Terma dan syarat yang berikut adalah turut terpakai:-",

  additionalTerms: [
    {
      id: "1",
      title: "Bagi Penjual, Pembekal Dan/Atau Pembekal Perkhidmatan",
      blocks: [
        {
          kind: "list",
          marker: "alpha",
          items: [
            {
              text: "Jika anda memproses Data Peribadi bagi pihak Kumpulan sebagai penjual, pembekal dan/atau pembekal perkhidmatan, anda dikehendaki untuk mengambil semua langkah yang diperlukan untuk memastikan bahawa anda mematuhi:",
              items: [
                { marker: "roman", text: "Akta tersebut; dan/atau" },
                {
                  marker: "roman",
                  text: "mana-mana undang-undang, peraturan, undang-undang kecil dan/atau garis panduan (sama ada mempunyai kuasa undang-undang atau sebaliknya) atau sepertimana yang diperlukan oleh mana-mana badan berkuasa kerajaan dan/atau bukan kerajaan, agensi atau jabatan.",
                },
              ],
            },
            {
              text: "Sekiranya anda gagal mematuhi mana-mana perkara yang dinyatakan dalam perenggan 1 ini, anda akan menanggung kerugian Kumpulan terhadap mana-mana tindakan, tuntutan, permintaan, denda, prosiding guaman, pendakwaan, kerugian, ganti rugi, penalti, kos dan perbelanjaan (termasuk tetapi tidak terhad kepada dasar kos guaman peguamcara dan anakguam) yang timbul di mana boleh diaju atau dibuat terhadap atau ditanggung oleh Kumpulan.",
            },
          ],
        },
      ],
    },
    {
      id: "2",
      title: "Sekiranya Anda Menggunakan Laman Web Kumpulan",
      blocks: [
        {
          kind: "list",
          marker: "alpha",
          items: [
            {
              text: 'Bagaimanakah Kami Mengendalikan E-Mel dan Mesej "Hubungi Kami"',
              items: [
                {
                  marker: "roman",
                  text: 'Kumpulan boleh mengekalkan kandungan mana-mana e-mel atau "Hubungi Kami" atau mesej elektronik lain yang diterima oleh Kumpulan.',
                },
                {
                  marker: "roman",
                  text: "Sebarang Data Peribadi yang terkandung di dalam mesej-mesej tersebut hanya akan digunakan atau didedahkan mengikut cara yang dinyatakan dalam Notis Privasi ini.",
                },
                {
                  marker: "roman",
                  text: "Kandungan mesej mungkin dipantau oleh pembekal-pembekal perkhidmatan atau pekerja-pekerja Kumpulan untuk tujuan termasuk pematuhan, pengauditan dan penyelenggaraan atau di mana penyalahgunaan e-mel disyaki.",
                },
              ],
            },
            {
              text: "Data Komunikasi atau Penggunaan",
              items: [
                {
                  marker: "roman",
                  text: "Melalui penggunaan perkhidmatan telekomunikasi anda untuk melayari laman web Kumpulan, data komunikasi anda (contohnya alamat protokol Internet) atau data penggunaan (contohnya maklumat awal, akhir dan tahap setiap akses, dan maklumat mengenai perkhidmatan telekomunikasi yang anda akses) adalah dijanakan secara teknikal dan mungkin berkaitan dengan Data Peribadi.",
                },
                {
                  marker: "roman",
                  text: "Setakat terdapat satu keperluan yang menambat perhatian, pengumpulan, pemprosesan dan penggunaan data komunikasi atau data penggunaan anda akan berlaku dan akan dilakukan selaras dengan Akta.",
                },
              ],
            },
            {
              text: "Data Bukan Peribadi Dikumpul Secara Automatik",
              items: [
                {
                  marker: "roman",
                  text: "Semasa anda melayari laman web Kumpulan, Kumpulan boleh secara automatik (iaitu, bukan melalui pendaftaran) mengumpul data bukan peribadi (contohnya jenis browser Internet dan sistem operasi yang digunakan, nama domain laman web dari mana anda datang, jumlah kunjungan, purata masa yang dihabiskan di laman web tersebut, muka surat yang dilihat).",
                },
                {
                  marker: "roman",
                  text: "Kumpulan boleh menggunakan data ini dan berkongsi dengan yang lain dalam Kumpulan untuk memantau daya tarikan laman web Kumpulan dan untuk meningkatkan prestasi atau kandungan mereka.",
                },
              ],
            },
            {
              text: "Cookies",
              items: [
                {
                  marker: "roman",
                  text: 'Apabila anda melihat laman web Kumpulan, Kumpulan boleh menyimpan beberapa data dalam komputer anda dalam bentuk "cookie" untuk mengiktiraf komputer peribadi anda secara automatik bila anda melayari pada masa depan.',
                },
                {
                  marker: "roman",
                  text: "Cookies boleh membantu Kumpulan dalam banyak cara, contohnya, dengan membenarkan Kumpulan menyesuaikan laman web supaya dapat sepadan dengan minat anda atau untuk menyimpan kata laluan anda supaya anda tidak perlu memasukkan kata laluan anda semula pada setiap layaran.",
                },
                {
                  marker: "roman",
                  text: "Jika anda tidak ingin menerima cookies, sila konfigurasikan browser Internet anda untuk memadamkan semua cookies dari hard drive komputer anda, menyekat semua cookies atau untuk menerima amaran sebelum cookie disimpan.",
                },
              ],
            },
            {
              text: "Penghubung",
              items: [
                {
                  marker: "roman",
                  text: "Laman web Kumpulan mungkin mengandungi penghubung ke laman dan halaman lain. Dengan mengaktifkan suatu penghubung, sebagai contohnya dengan mengklik pada panji pengiklan, anda meninggalkan laman web Kumpulan dan Kumpulan tidak akan melaksanakan kawalan ke atas mana-mana Data Peribadi atau apa-apa maklumat lain yang anda berikan kepada mana-mana entiti lain selepas anda meninggalkan laman web Kumpulan.",
                },
              ],
            },
            {
              text: "Keselamatan Data Peribadi",
              items: [
                {
                  marker: "roman",
                  text: "Bagi Internet, malangnya, tiada penghantaran data melalui Internet boleh dijamin selamat sepenuhnya. Oleh itu walaupun Kumpulan berusaha untuk melindungi Data Peribadi tersebut, Kumpulan tidak dapat memastikan atau menjamin keselamatan sebarang Data Peribadi yang dihantar kepada Kumpulan dan anda berbuat demikian atas risiko anda sendiri. Sebaik sahaja mana-mana Data Peribadi menjadi milikan Kumpulan, Kumpulan akan mengambil langkah-langkah yang munasabah untuk melindungi maklumat daripada penyalahgunaan dan kehilangan dan daripada akses, pengubahsuaian atau pendedahan yang tidak dibenarkan.",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
