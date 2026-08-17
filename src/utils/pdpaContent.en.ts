/**
 * Verbatim text of "PMW INTERNATIONAL BERHAD - PRIVACY NOTICE", document
 * reference "Privacy Notice 020126" (English). Clause numbering follows the
 * source document exactly. Do not reword or summarise — this is legal wording,
 * not app copy. The Malay rendition of the same revision lives in
 * `pdpaContent.ms.ts` and must be updated alongside it.
 */
import type { PdpaNoticeContent } from "./pdpaTypes";

export const PDPA_CONTENT_EN: PdpaNoticeContent = {
  locale: "en",

  preamble:
    'PMW International Berhad, its subsidiaries, associates, jointly controlled entities and affiliates (including but not limited to PMW International Berhad and PMW International Berhads’ associates, jointly controlled entities and affiliates and any company to whom you are/will be seconded/transferred to (collectively, "Group"), respects the privacy of individuals with regard to personal data. This Privacy Notice is formulated in accordance with the Personal Data Protection Act 2010 ("Act"). For the purpose of this Privacy Notice, "Personal Data" shall have the meaning as ascribed to it in the Act and "we" and "us" shall refer to any of the companies within the Group and "you" shall refer to yourself and/or such other persons represented by you of which you are providing Personal Data.',

  summary:
    "Your personal data is collected, retained and used by the Group for human resource, recruitment, programme, operational, legal and regulatory purposes, and may be disclosed and transferred within the Group and to third parties as set out in the Privacy Notice.",

  retentionSummary:
    "Personal data is stored in hard copy at the Group's offices or on servers in or outside Malaysia, and is retained for as long as necessary to fulfil the purposes stated in the Privacy Notice or to satisfy legal, regulatory and accounting requirements, or to protect the Group's interests.",

  consentLabel:
    "I have read and understood the PMW International Berhad Privacy Notice, and I consent to the Group collecting, retaining, using, disclosing and transferring my personal data for the purposes set out in it.",

  thirdPartyConfirmation:
    "Where you provide personal data about another person, including your referees, you confirm that you have obtained their consent for it to be used and disclosed to the Group in accordance with this Privacy Notice.",

  contactEntity: "PMW International Berhad and/or the Group",
  personInCharge: "Group Chief Human Resources Officer",

  ui: {
    languageName: "English",
    documentTitle: "Privacy Notice",
    eyebrow: "PDPA Privacy Notice",
    versionLabel: (version) => `Notice version ${version}`,
    back: "Back",
    returnHome: "Return Home",
    addressLabel: "Address",
    personInChargeLabel: "Person in charge",
    emailLabel: "Email",
    telLabel: "Tel No",
    viewNotice: "View Privacy Notice",
    consentRequired: "Consent is required before submission.",
    footer:
      "Questions, access requests, correction requests, or withdrawal of consent can be sent to the address above. This notice should be read together with any form-specific instructions shown before submission.",
    consentRecordNote: (version) =>
      `Notice version ${version}. Your consent record is stored with this application.`,
  },

  sections: [
    {
      id: "A",
      title: "Information Collected",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: 'The Personal Data about you which we may collect via print and digital platforms (including but not limited to the Group’s website, online portals, social media and mobile apps ("the Group’s Portals")) includes:',
              items: [
                {
                  marker: "alpha",
                  text: "information collected when you fill in or update your information with us, which may include personal data such as your photograph, name, contact details, age, marital status, racial or ethnic origin, creditworthiness, physical or mental health or medical condition, dietary preference and/or the commission or alleged commission of any offence or proceedings for any offence committed including past misconduct, the disposal of such proceedings or the sentence of any court in such proceedings;",
                },
                {
                  marker: "alpha",
                  text: "the contents of all printed and electronic forms or documents submitted to us via printed collateral or forms and the Group’s Portals, including identity documents and proof of address as well as the contents of any videos submitted;",
                },
                {
                  marker: "alpha",
                  text: "information input or submitted to online facilities such as search tools and calculators (if any);",
                },
                { marker: "alpha", text: "personalisation preferences you select as you use the Group’s Portals;" },
                {
                  marker: "alpha",
                  text: "information submitted if you participate in survey whether via online or otherwise;",
                },
                {
                  marker: "alpha",
                  text: "any messages or comments you submit to us in whatever manner, which may include personal data such as name, email address and telephone number;",
                },
                { marker: "alpha", text: "information obtained independently by the Group from other lawful sources;" },
                {
                  marker: "alpha",
                  text: "information required in the course of the Group’s business related activities; and",
                },
                {
                  marker: "alpha",
                  text: "the contents of all forms and/or documents submitted and/or collected by the Group.",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "B",
      title: "Purpose Of Collection Of Personal Data",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "By providing any of your Personal Data to the Group, you hereby agree that the Group shall collect, retain and use the Personal Data for the following purposes:",
              items: [
                {
                  marker: "alpha",
                  text: "providing you with services or benefits under any of the Group’s businesses or policies and/or for any human resource purposes including but not limited to:",
                  items: [
                    {
                      marker: "roman",
                      text: "assessing individual work performance, attendance and disciplinary record;",
                    },
                    { marker: "roman", text: "conducting employee disciplinary proceedings;" },
                    { marker: "roman", text: "conducting training of employees;" },
                    {
                      marker: "roman",
                      text: "obtaining and maintaining employee health records and information which includes requiring you to provide medical health records, complete a medical questionnaire and/or undertake a medical examination;",
                    },
                    { marker: "roman", text: "reviewing salaries, bonuses and other benefits;" },
                    {
                      marker: "roman",
                      text: "providing employee references which include: letters to third parties providing employee’s details (excluding salary information) of employment with the Group;",
                    },
                    {
                      marker: "roman",
                      text: "monitoring business communications (which includes, but not limited to, communications by telephone and email) for reasons which include: providing evidence of business transactions; ensuring that our business procedures, policies and contracts with employees are adhered to; complying with any legal obligations; monitoring standards of service, staff performance, and for staff training; and",
                    },
                    {
                      marker: "roman",
                      text: "all other matters relating to your employment with the Group as the Group considers to be necessary or appropriate; and/or",
                    },
                  ],
                },
                { marker: "alpha", text: "processing your application under any of the Group’s programmes; and/or" },
                {
                  marker: "alpha",
                  text: "where relevant, marketing of goods and services and sending any updates, new products, special offers, advertising, promotional material and/or commercial material to you (including emails, short message services or other means) and/or to be used in, to provide and/or improve the services of the Group and providing other services to enhance and support the relationship of the Group and you and/or such other persons represented by you; and/or",
                },
                {
                  marker: "alpha",
                  text: "conducting research on planning, products, goods, services, security and testing; and/or",
                },
                { marker: "alpha", text: "carrying out matching procedure in accordance with the law; and/or" },
                {
                  marker: "alpha",
                  text: "performing statistical analysis for various objectives in the Group and providing this information within the Group; and/or",
                },
                {
                  marker: "alpha",
                  text: "where you have provided your resume, considering you for any jobs that may arise in the Group; and/or",
                },
                {
                  marker: "alpha",
                  text: "purposes connected with the operation, administration, development or enhancement of the Group’s business including for the purpose of which is relevant to support and/or assist in any of the Group’s businesses (for example, providing information on you and on your working experience to fulfil information as required for the submission of tenders for projects or for fulfilling regulatory requirements); and/or",
                },
                {
                  marker: "alpha",
                  text: "where required by law, where the Group consider that such use or disclosure is necessary to respond to any claims or legal process, or where the Group suspects that fraud or unlawful activity has been, is being or may be engaged in; and/or",
                },
                {
                  marker: "alpha",
                  text: "where a third party acquires or wishes to acquire, or makes inquiries in relation to acquiring, an interest in any company within the Group; and/or",
                },
                {
                  marker: "alpha",
                  text: "where a third party requires in order for such third party to perform functions or services as required by the Group (for example, to insurance companies who are arranging for the Group’s term life/insurance policy(ies) and to banks who are arranging for salary remittances (for employees) and to bank for scholarship disbursements and living expenses payments (for scholars); and/or",
                },
                {
                  marker: "alpha",
                  text: "where a third party requires in order for such third party to perform functions or obligations as required under the laws, rules, regulations, by laws and/or guidelines (whether or not having the force of law) or as required by any governmental and/or non-governmental authorities, agencies or departments (for example, to external auditors who are auditing the Group’s human resource and learning/training centre’s processes) or a third party requires in order to ensure compliance with agreement(s) or document(s); and/or",
                },
                {
                  marker: "alpha",
                  text: "where a third party requires for purposes of preparation and submission of any claims or payments to any party or for any audit/checks by any party for whatever purpose related to the Group’s business; and/or",
                },
                {
                  marker: "alpha",
                  text: "purposes connected with the enforcement of the Group’s rights pursuant to any letter, agreement and/or document including seeking legal and financial advice, taking any preliminary steps or commencing any legal action; and/or",
                },
                {
                  marker: "alpha",
                  text: "if you are applying as a trainer or has been appointed as trainer, in addition to the purposes set out here, for evaluating and assessing your suitability and if you are successful, for the subsequent preparation and execution of the relevant agreements and documents and administration of your appointment as a trainer; and/or",
                },
                {
                  marker: "alpha",
                  text: "for any other purposes that is incidental or ancillary or in furtherance to the Group’s purposes; and/or",
                },
                {
                  marker: "alpha",
                  text: "making such disclosures as may be required for any of the above purposes or by law.",
                },
              ],
            },
            {
              text: "We may contact you for the purpose as set out in (B) above either via telephone calls, emails, short message services, social media, post, facsimile or by whatsoever form of available communication.",
            },
          ],
        },
      ],
    },
    {
      id: "C",
      title: "Use And Disclosure",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "You further agree that the Group may disclose and transfer (whether in Malaysia or abroad) amongst any company within the Group and/or to third parties including but not limited to educational institutions and external assessors of the scholarships or to any company to whom you are/will be seconded/transferred to, the Group’s agents, consultants, solicitors, auditors, employers, contractors, suppliers, partners, joint venture partners, purchasers, network operators, associated companies, any relevant authorities (governmental and/or non-governmental), embassies, statutory bodies, regulatory bodies, organisations and/or any relevant financial institutions, any other persons under a duty of confidentiality to the Group or any companies within the Group (including those established or incorporated from time to time), any referee whose details are provided by you, any of the companies within the Group, actual or proposed assignees or transferees or buyers of any of rights/businesses/assets of the companies within the Group, service providers (including those who assist us in providing/developing/maintaining the Group’s Portals), for the Group’s operational, administration and development requirements and to organizations who provide archival, auditing, professional advisory, debt collection, insurance, banking, delivery, recruitment, call centre, technology, research, utility and security services to use, disclose, hold, process, retain or transfer such Personal Data for the purposes of (B) above for and on behalf of the Group.",
            },
            {
              text: "The Group uses and discloses aggregated non-personally identifying information collected by us as part of the Group’s process of constantly improving the Group’s Portals and/or the Group’s businesses.",
            },
          ],
        },
      ],
    },
    {
      id: "D",
      title: "Impact Of Non Provision Of Personal Data",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "Please note that in the event that sufficient Personal Data is not supplied, or is not satisfactory to the Group, then your application or request to the Group for any of the purposes as set out in (B) above may not be accepted or acted upon or the Group will not be able to provide the full range of benefits and/or services and/or perform its obligations under any potential or existing contract with you.",
            },
          ],
        },
      ],
    },
    {
      id: "E",
      title: "Storage And Retention Of The Personal Data",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "Your Personal Data shall be stored either in hard copies in the Group’s offices or stored in servers located in or outside Malaysia and operated by the Group or its service providers in or outside Malaysia.",
            },
            {
              text: "Any Personal Data supplied by you will be retained by the Group as long as necessary for the fulfilment of the purposes stated in (B) above or is required to satisfy any legal, regulatory and/or accounting requirements or to protect the Group’s interests.",
            },
            {
              text: "The Group does not offer any online facilities for you to delete your Personal Data held by the Group.",
            },
          ],
        },
      ],
    },
    {
      id: "F",
      title: "Job Applicants",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "Personal Data provided in connection with an application for employment will be used to determine your suitability for a position with the Group and, if applicable, your terms of employment or engagement.",
            },
            {
              text: "You hereby confirm that you have duly obtained the consent of your referee(s) for the use and disclosure of your referee(s)’ Personal Data to the Group and that the Group may use your referee(s)’ Personal Data in accordance with this Privacy Notice.",
            },
            {
              text: "Your Personal Data may also be used to monitor the Group’s recruitment initiatives and equal opportunities policies.",
            },
            {
              text: "Your Personal Data may be disclosed to third parties to verify or obtain additional information including education institutions, current/previous employers and credit reference agencies.",
            },
            { text: "Unsuccessful applications may be retained to match your skills to future job opportunities." },
          ],
        },
      ],
    },
    {
      id: "G",
      title: "Confidentiality",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "Personal Data held by the Group will be kept confidential in accordance with this Privacy Notice pursuant to any applicable law that may from time to time be in force.",
            },
            {
              text: "Any questions, comments, suggestions or information other than Personal Data submitted to us in whatever manner will be deemed voluntarily provided to the Group on a non-confidential and non-proprietary basis.",
            },
            {
              text: "The Group reserves the right to use, reproduce, disclose, transmit, publish, broadcast and/or post elsewhere such information freely as set out in (C) above.",
            },
          ],
        },
      ],
    },
    {
      id: "H",
      title: "Safety Of Personal Data",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "The Group uses a number of mechanisms to protect the security and integrity of your Personal Data.",
            },
            {
              text: "A username and password may be essential for you to use some sections of the Group’s Portals. For your own protection, the Group requires you to keep these confidential and to change your password regularly (if required).",
            },
          ],
        },
      ],
    },
    {
      id: "I",
      title: "Transfer Of Personal Data",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "Due to the global nature of the Group’s business, the Group may transfer your Personal Data to the other members of the Group (which may be located in other countries) or to any parties located in other countries (including countries that have a different data protection regime than is found in the country where you are based). Any Personal Data transferred shall be used for the purposes as set out in (B) above and disclosed to parties stated in (C) above.",
            },
          ],
        },
      ],
    },
    {
      id: "J",
      title: "Right Of Access To Personal Data",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "Under the Act, you have the right of access to your Personal Data held by the Group and you may request that the Group correct any of your Personal Data that is inaccurate, incomplete or out-of-date, subject to any applicable legal restrictions and contractual/employment conditions.",
            },
            {
              text: "If you have any questions regarding this Privacy Notice or if you wish to request access to your Personal Data or if you wish to correct your Personal Data or if you wish to withdraw your consent to the Group for the processing of your Personal Data for the purposes as set out in (B) above or for the transfer of your Personal Data to the parties stated in (C) above, you may send your request in writing to the following address:",
            },
          ],
        },
        { kind: "contact" },
        {
          kind: "text",
          text: "Please note that notwithstanding the withdrawal of your consent, the Group may still proceed to process your Personal Data in circumstances recognized and permitted by law and as required under the contractual/employment conditions.",
        },
      ],
    },
    {
      id: "K",
      title: "Personal Data Given By You",
      blocks: [
        {
          kind: "list",
          marker: "decimal",
          items: [
            {
              text: "You hereby confirm that you have obtained the consent from the persons whose Personal Data you are providing to us for the purposes as set out in (B) above and disclosed to parties stated in (C) above.",
            },
            {
              text: "You are responsible for providing accurate, complete and updated Personal Data about yourself and/or any other person whose Personal Data you provide to us. As such, as and when such Personal Data becomes inaccurate, incomplete or outdated, you should correct or update such Personal Data by contacting us or submitting latest Personal Data to us in writing in accordance with (J) above.",
            },
          ],
        },
      ],
    },
    {
      id: "L",
      title: "Changes To Privacy Notice",
      blocks: [
        {
          kind: "text",
          text: "The Group reserves the right to modify, update and/or amend this Privacy Notice from time to time without prior notice. The Group advises that you check this Privacy Notice on our Group’s website on a regular basis.",
        },
      ],
    },
  ],

  additionalTermsIntro: "The following terms and conditions are further applicable:-",

  additionalTerms: [
    {
      id: "1",
      title: "To Vendors, Suppliers And/Or Service Providers",
      blocks: [
        {
          kind: "list",
          marker: "alpha",
          items: [
            {
              text: "If you are processing Personal Data on behalf of the Group as a vendor, supplier and/or service provider, you shall be required to take all necessary steps to ensure that you are in compliance with:",
              items: [
                { marker: "roman", text: "the Act; and/or" },
                {
                  marker: "roman",
                  text: "any other laws, rules, regulations, by laws and/or guidelines (whether or not having the force of law) or as required by any governmental and/or non-governmental authorities, agencies or departments.",
                },
              ],
            },
            {
              text: "In the event you fail to comply with any items stated in this paragraph 1, you shall indemnify the Group against any actions, claims, demands, fines, suits proceedings, prosecution, losses, damages, penalties, costs and expenses (including but not limited to legal costs on solicitor and client basis) howsoever arising which may be brought or made against or incurred by the Group.",
            },
          ],
        },
      ],
    },
    {
      id: "2",
      title: "If You Use The Group’s Website",
      blocks: [
        {
          kind: "list",
          marker: "alpha",
          items: [
            {
              text: "How We Handle Email and “Contact Us” Messages",
              items: [
                {
                  marker: "roman",
                  text: 'The Group may preserve the content of any emails or "Contact us" or other electronic messages that the Group receives.',
                },
                {
                  marker: "roman",
                  text: "Any personal data contained in those messages will only be used or disclosed in ways set out in this Privacy Notice.",
                },
                {
                  marker: "roman",
                  text: "The message content may be monitored by the Group’s service providers or employees for purposes including compliance, auditing and maintenance or where email abuse is suspected.",
                },
              ],
            },
            {
              text: "Communication or Utilization Data",
              items: [
                {
                  marker: "roman",
                  text: "Through your use of telecommunications services to access the Group’s website, your communications data (e.g. Internet protocol address) or utilization data (e.g. information on the beginning, end and extent of each access, and information on the telecommunications services you accessed) are technically generated and could conceivably relate to Personal Data.",
                },
                {
                  marker: "roman",
                  text: "To the extent that there is a compelling necessity, the collection, processing and use of your communications or utilization data will occur and will be performed in accordance with the Act.",
                },
              ],
            },
            {
              text: "Non-Personal Data Collected Automatically",
              items: [
                {
                  marker: "roman",
                  text: "When you access the Group’s website, the Group may automatically (i.e., not by registration) collect non-personal data (e.g. type of Internet browser and operating system used, domain name of the website from which you came, number of visits, average time spent on the site, pages viewed).",
                },
                {
                  marker: "roman",
                  text: "The Group may use this data and share it with the rest of the Group to monitor the attractiveness of the Group’s website and to improve their performance or content.",
                },
              ],
            },
            {
              text: "Cookies",
              items: [
                {
                  marker: "roman",
                  text: 'When you view the Group’s website, the Group may store some data on your computer in the form of a "cookie" to automatically recognize your personal computer next time you visit.',
                },
                {
                  marker: "roman",
                  text: "Cookies can help the Group in many ways, for example, by allowing the Group to tailor a website to better match your interests or to store your password to save you having to re-enter it each time.",
                },
                {
                  marker: "roman",
                  text: "If you do not wish to receive cookies, please configure your Internet browser to erase all cookies from your computer’s hard drive, block all cookies or to receive a warning before a cookie is stored.",
                },
              ],
            },
            {
              text: "Links",
              items: [
                {
                  marker: "roman",
                  text: "The Group’s website may contain links to other sites and pages. By activating a link, such as for example by clicking on the banner of an advertiser, you leave the Group’s website and the Group does not exercise control over any Personal Data or any other information you give to any other entity after you have left the Group’s website.",
                },
              ],
            },
            {
              text: "Safety of Personal Data",
              items: [
                {
                  marker: "roman",
                  text: "For Internet, unfortunately, no data transmission over the Internet can be guaranteed as completely secure. So while the Group strives to protect such Personal Data, the Group cannot ensure or warrant the security of any Personal Data transmitted to the Group and you do so at your own risk. Once any Personal Data comes into the Group’s possession, the Group will take reasonable steps to protect that information from misuse and loss and from unauthorised access, modification or disclosure.",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
